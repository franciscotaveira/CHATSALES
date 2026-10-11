import type { FC } from "react";
import { Avatar, ListItem } from "@sos-sales/ui";
import type { CommercialThreadSummary } from "../../../services/api-client";
import { formatTime } from "../utils/formatTime";
import { formatPhone } from "../utils/formatPhone";
import { renderWhatsappMarkdown } from "../utils/whatsappMarkdown";

interface ConversationRowProps {
  thread: CommercialThreadSummary;
  selected: boolean;
  onSelect: (threadId: string) => void;
}

export const ConversationRow: FC<ConversationRowProps> = ({
  thread,
  selected,
  onSelect,
}) => {
  const hasName = Boolean(thread.contactName && thread.contactName.trim());
  const displayName = hasName
    ? thread.contactName
    : formatPhone(thread.contactPhone) || "Contato sem nome";

  const rawSnippet = thread.lastMessage?.body || "Sem mensagens";
  const formattedTime = formatTime(thread.lastMessageAt || thread.updatedAt);
  const isUnread = thread.status === "waiting_human" || thread.lastMessage?.direction === "inbound";

  return (
    <ListItem
      height="lg"
      selected={selected}
      onClick={() => onSelect(thread.id)}
      leading={
        <Avatar
          id={thread.id}
          name={hasName && thread.contactName ? thread.contactName : undefined}
          size="lg"
        />
      }
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
          <span
            style={{
              fontSize: "var(--font-size-sm)",
              fontWeight: selected || isUnread ? 600 : 500,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
          {thread.journeyStage && (
            <span
              style={{
                fontSize: "9.5px",
                padding: "1px 5px",
                borderRadius: "4px",
                backgroundColor: "var(--bg-surface-elevated)",
                color: "var(--text-secondary)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                flexShrink: 0,
              }}
            >
              {thread.journeyStage}
            </span>
          )}
        </div>
      }
      subtitle={
        <span
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-secondary)",
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.4,
          }}
        >
          {renderWhatsappMarkdown(rawSnippet, { singleLine: true })}
        </span>
      }
      meta={formattedTime}
      trailing={
        thread.status === "waiting_human" ? (
          <span
            title="Transbordo Solicitado pela IA"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              padding: "2px 6px",
              borderRadius: "10px",
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              color: "#d97706",
              fontSize: "10px",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            IA ⚠️
          </span>
        ) : isUnread ? (
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--color-action)",
              display: "inline-block",
              flexShrink: 0,
            }}
            aria-label="Aguardando atendimento"
          />
        ) : undefined
      }
    />
  );
};
