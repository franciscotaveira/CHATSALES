import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient, type CommercialThreadSummary, type ChannelSummary } from "../../../services/api-client";
import type { UseSessionReturn } from "../../../hooks/useSession";

export type QueueFilter = "open" | "needs_attention" | "all" | "closed";

export const useInbox = (session: UseSessionReturn) => {
  const { token, activeWorkspace } = session;

  const [threads, setThreads] = useState<CommercialThreadSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState<boolean>(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Fetch channels on workspace change
  useEffect(() => {
    if (!activeWorkspace?.id || !token) return;

    let isMounted = true;
    apiClient
      .getChannels(activeWorkspace.id, { token })
      .then((res) => {
        if (isMounted) setChannels(res.channels);
      })
      .catch(() => {
        // Non-blocking
      });

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, token]);

  // 2. Fetch and poll commercial threads
  const loadThreads = useCallback(async () => {
    if (!activeWorkspace?.id || !token) return;

    try {
      const statusParam =
        queueFilter === "open"
          ? "active"
          : queueFilter === "closed"
          ? "closed"
          : undefined;

      const needsAttentionParam = queueFilter === "needs_attention" ? true : undefined;

      const res = await apiClient.getThreads(
        activeWorkspace.id,
        { status: statusParam, needsAttention: needsAttentionParam },
        { token }
      );
      setThreads(res.threads);
    } catch {
      // Polling non-fatal
    }
  }, [activeWorkspace?.id, token, queueFilter]);

  useEffect(() => {
    if (!activeWorkspace?.id || !token) return;

    setIsLoadingThreads(true);
    loadThreads().finally(() => setIsLoadingThreads(false));

    // Poll threads every 3.5 seconds
    const interval = setInterval(loadThreads, 3500);
    return () => clearInterval(interval);
  }, [loadThreads, activeWorkspace?.id, token]);

  // Filtered threads by search query
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase().trim();
    return threads.filter((t) => {
      const name = (t.contactName || "").toLowerCase();
      const phone = (t.contactPhone || "").toLowerCase();
      const snippet = (t.lastMessage?.body || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || snippet.includes(q);
    });
  }, [threads, searchQuery]);

  const activeChannel = channels.find((c) => c.status === "connected") || channels[0] || null;

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const syncActiveChannel = useCallback(async (channelId?: string) => {
    if (!activeWorkspace?.id || !token) return;
    const targetChannelId = channelId || activeChannel?.id;
    if (!targetChannelId) return;

    setIsSyncing(true);
    try {
      const res = await apiClient.syncChannelChats(activeWorkspace.id, targetChannelId, { token });
      await loadThreads();
      return res;
    } finally {
      setIsSyncing(false);
    }
  }, [activeWorkspace?.id, token, activeChannel?.id, loadThreads]);

  return {
    threads,
    filteredThreads,
    channels,
    activeChannel,
    isLoadingThreads,
    isSyncing,
    syncActiveChannel,
    queueFilter,
    setQueueFilter,
    searchQuery,
    setSearchQuery,
    refreshThreads: loadThreads,
  };
};

