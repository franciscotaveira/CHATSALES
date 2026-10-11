import { type FC, useState, useEffect } from "react";
import { Drawer, EmptyState, useBreakpoint } from "@sos-sales/ui";
import { MessageSquare } from "lucide-react";
import { useSession, type UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type CommercialProposalSummary, type ProductRecord, type ContactSummary } from "../../services/api-client";
import { getCustomStages, type CustomStagesMap } from "../opportunities/stages";
import { useInbox } from "./hooks/useInbox";
import { useConversation } from "./hooks/useConversation";
import { useCockpitLayout } from "./hooks/useCockpitLayout";
import { InboxList } from "./InboxList/InboxList";
import { ConversationHeader } from "./Conversation/ConversationHeader";
import { MessageList } from "./Conversation/MessageList";
import { Composer } from "./Conversation/Composer";
import { ContextPanel } from "./ContextPanel/ContextPanel";
import { CockpitDrawers, type DrawerType } from "./drawers/CockpitDrawers";
import { panelFrame, PANEL_GAP } from "./utils/panelFrame";

interface CockpitPageProps {
  session?: UseSessionReturn;
}

export const CockpitPage: FC<CockpitPageProps> = ({ session: propSession }) => {
  const fallbackSession = useSession(null);
  const session = propSession || fallbackSession;
  const { isMobile, isTablet } = useBreakpoint();
  const layout = useCockpitLayout();
  const inbox = useInbox(session);
  const conversation = useConversation(layout.selectedThreadId, session, inbox.threads, inbox.refreshThreads);

  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [proposals, setProposals] = useState<CommercialProposalSummary[]>([]);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactSummary | null>(null);
  const [customStages, setCustomStages] = useState<CustomStagesMap>({});
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);

  useEffect(() => {
    if (session.activeWorkspace?.id) {
      setCustomStages(getCustomStages(session.activeWorkspace.id));
    }
  }, [session.activeWorkspace?.id]);

  useEffect(() => {
    if (!conversation.selectedThread || !session.activeWorkspace?.id || !session.token) {
      setSelectedContact(null);
      return;
    }
    apiClient
      .getContacts(
        session.activeWorkspace.id,
        { search: conversation.selectedThread.contactPhone, status: "all", limit: 1 },
        { token: session.token }
      )
      .then((res) => {
        setSelectedContact(res.contacts[0] || null);
      })
      .catch(() => setSelectedContact(null));
  }, [conversation.selectedThread?.id, conversation.selectedThread?.contactPhone, session.activeWorkspace?.id, session.token]);

  const handleUpdateLeadStage = async (newStage: string) => {
    if (!conversation.selectedThread || !session.activeWorkspace?.id || !session.token) return;
    const workspaceId = session.activeWorkspace.id;
    const thread = conversation.selectedThread;
    setIsUpdatingStage(true);

    try {
      const res = await apiClient.listJourneys(workspaceId, { limit: 100 }, { token: session.token });
      const journey = res.items.find(
        (j) => j.threadId === thread.id || j.contactId === thread.contactId
      );

      if (newStage === "won" || newStage === "lost") {
        if (journey) {
          await apiClient.recordJourneyOutcome(
            workspaceId,
            journey.id,
            { status: newStage, valueCents: journey.estimatedValueCents || 0 },
            { token: session.token }
          );
        } else {
          const newJ = await apiClient.createJourney(
            workspaceId,
            {
              contactId: thread.contactId,
              stage: "proposal",
              title: thread.contactName || "Oportunidade Comercial",
            },
            { token: session.token }
          );
          await apiClient.recordJourneyOutcome(
            workspaceId,
            newJ.id,
            { status: newStage, valueCents: 0 },
            { token: session.token }
          );
        }
      } else {
        if (journey) {
          await apiClient.updateJourneyStage(workspaceId, journey.id, newStage as any, {
            token: session.token,
          });
        } else {
          await apiClient.createJourney(
            workspaceId,
            {
              contactId: thread.contactId,
              stage: newStage as any,
              title: thread.contactName || "Oportunidade Comercial",
            },
            { token: session.token }
          );
        }
      }

      await inbox.refreshThreads();
      if (thread.contactPhone) {
        const contactRes = await apiClient.getContacts(
          workspaceId,
          { search: thread.contactPhone, status: "all", limit: 1 },
          { token: session.token }
        );
        if (contactRes.contacts[0]) {
          setSelectedContact(contactRes.contacts[0]);
        }
      }
    } catch (err: unknown) {
      alert((err as Error).message || "Falha ao atualizar etapa do lead.");
    } finally {
      setIsUpdatingStage(false);
    }
  };

  useEffect(() => {
    if (!layout.selectedThreadId || !session.activeWorkspace?.id || !session.token) {
      setProposals([]);
      return;
    }
    apiClient
      .getThreadProposals(session.activeWorkspace.id, layout.selectedThreadId, { token: session.token })
      .then((res) => setProposals(res.items || []))
      .catch(() => setProposals([]));
  }, [layout.selectedThreadId, session.activeWorkspace?.id, session.token]);

  const handleUpdateProposalStatus = async (proposalId: string, status: CommercialProposalSummary["status"]) => {
    if (!session.activeWorkspace?.id || !session.token) return;
    setProposalError(null);
    try {
      await apiClient.patchProposalStatus(session.activeWorkspace.id, proposalId, { status }, { token: session.token });
      if (layout.selectedThreadId) {
        const res = await apiClient.getThreadProposals(session.activeWorkspace.id, layout.selectedThreadId, { token: session.token });
        setProposals(res.items || []);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || "";
      setProposalError(msg.includes("409") ? "A proposta foi alterada por outra pessoa — recarregue a página." : msg || "Falha ao atualizar proposta.");
    }
  };

  const handleSendProduct = async (product: ProductRecord) => {
    if (!conversation.selectedThread || !session.activeWorkspace?.id || !session.token) return;
    const formattedPrice = (product.priceCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: product.currency || "BRL",
    });

    const isWaba = conversation.selectedThread.channelProvider === "meta_waba";

    try {
      if (isWaba && product.catalogId && product.retailerId) {
        await apiClient.sendOutboundMessage(
          session.activeWorkspace.id,
          conversation.selectedThread.channelInstanceId,
          {
            recipientPhoneE164: conversation.selectedThread.contactPhone,
            contentType: "interactive",
            body: `🛍️ *${product.title}*\n${product.description ? `\n${product.description}\n` : ""}\n💰 *Valor:* ${product.priceFormatted || formattedPrice}`,
            interactive: {
              type: "product",
              body: {
                text: `🛍️ *${product.title}*\n${product.description ? `\n${product.description}\n` : ""}\n💰 *Valor:* ${product.priceFormatted || formattedPrice}\n\n_Toque abaixo para ver no catálogo e finalizar pedido:_`,
              },
              footer: {
                text: "SOS Sales",
              },
              action: {
                catalog_id: product.catalogId,
                product_retailer_id: product.retailerId,
              },
            },
          },
          { token: session.token }
        );
      } else {
        const body = `🛍️ *${product.title}*\n\n${product.description ? `${product.description}\n\n` : ""}💰 *Valor:* ${product.priceFormatted || formattedPrice}\n\n_Deseja agendar ou adquirir este item? Basta responder aqui!_`;
        await apiClient.sendOutboundMessage(
          session.activeWorkspace.id,
          conversation.selectedThread.channelInstanceId,
          {
            recipientPhoneE164: conversation.selectedThread.contactPhone,
            contentType: product.imageUrl ? "image" : "text",
            body,
            mediaUrl: product.imageUrl || undefined,
          },
          { token: session.token }
        );
      }
      await conversation.refreshMessages();
      setActiveDrawer(null);
    } catch (err: unknown) {
      alert((err as Error).message || "Falha ao enviar produto.");
    }
  };

  const handleSendProducts = async (selectedProducts: ProductRecord[]) => {
    if (!conversation.selectedThread || !session.activeWorkspace?.id || !session.token || selectedProducts.length === 0) return;

    const isWaba = conversation.selectedThread.channelProvider === "meta_waba";
    const catalogId = selectedProducts[0]?.catalogId;

    try {
      if (isWaba && catalogId && selectedProducts.every((p) => p.retailerId)) {
        await apiClient.sendOutboundMessage(
          session.activeWorkspace.id,
          conversation.selectedThread.channelInstanceId,
          {
            recipientPhoneE164: conversation.selectedThread.contactPhone,
            contentType: "interactive",
            body: `✨ *Catálogo de Destaques Selecionados* (${selectedProducts.length} itens)`,
            interactive: {
              type: "product_list",
              header: {
                type: "text",
                text: "Ofertas Selecionadas",
              },
              body: {
                text: "Separamos essas opções especialmente para você. Toque no botão abaixo para explorar o catálogo e escolher:",
              },
              footer: {
                text: "SOS Sales • Atendimento Comercial",
              },
              action: {
                catalog_id: catalogId,
                sections: [
                  {
                    title: "Destaques Disponíveis",
                    product_items: selectedProducts.map((p) => ({
                      product_retailer_id: p.retailerId,
                    })),
                  },
                ],
              },
            },
          },
          { token: session.token }
        );
      } else {
        const lines = selectedProducts.map((p, idx) => {
          const formattedPrice = (p.priceCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: p.currency || "BRL",
          });
          return `*${idx + 1}. ${p.title}* — ${p.priceFormatted || formattedPrice}${p.description ? `\n   _${p.description}_` : ""}`;
        });

        const body = `✨ *Catálogo de Destaques Selecionados:*\n\n${lines.join("\n\n")}\n\n_Qual das opções você gostaria de agendar ou adquirir?_`;

        await apiClient.sendOutboundMessage(
          session.activeWorkspace.id,
          conversation.selectedThread.channelInstanceId,
          {
            recipientPhoneE164: conversation.selectedThread.contactPhone,
            contentType: "text",
            body,
          },
          { token: session.token }
        );
      }
      await conversation.refreshMessages();
      setActiveDrawer(null);
    } catch (err: unknown) {
      alert((err as Error).message || "Falha ao enviar carrossel de produtos.");
    }
  };

  const isThreadActive = Boolean(layout.selectedThreadId && conversation.selectedThread);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden", backgroundColor: "var(--bg-canvas)", gap: isMobile ? 0 : PANEL_GAP, padding: isMobile ? 0 : PANEL_GAP, boxSizing: "border-box" }}>
      {/* 1. Inbox List Panel */}
      {(!isMobile || !isThreadActive) && (
        <InboxList
          threads={inbox.filteredThreads}
          selectedThreadId={layout.selectedThreadId}
          onSelectThread={layout.setSelectedThreadId}
          queueFilter={inbox.queueFilter}
          onQueueFilterChange={inbox.setQueueFilter}
          searchQuery={inbox.searchQuery}
          onSearchQueryChange={inbox.setSearchQuery}
          isCollapsed={layout.isLeftCollapsed}
          onToggleCollapse={layout.toggleLeft}
          activeChannel={inbox.activeChannel}
          channels={inbox.channels}
          selectedChannelId={inbox.selectedChannelId}
          onSelectChannelId={inbox.setSelectedChannelId}
          isMobile={isMobile}
          onSync={() => inbox.syncActiveChannel()}
          isSyncing={inbox.isSyncing}
        />
      )}

      {/* 2. Conversation / Empty State Area */}
      {(!isMobile || isThreadActive) && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, backgroundColor: "var(--bg-surface)", ...panelFrame(isMobile) }}>
          {conversation.selectedThread ? (
            <>
              <ConversationHeader
                thread={conversation.selectedThread}
                onBack={layout.handleBackToList}
                isMobile={isMobile}
                onRefresh={async () => {
                  await Promise.all([conversation.refreshMessages(), inbox.refreshThreads()]);
                }}
                isRefreshing={conversation.isLoadingMessages}
                onOpenRadar={() => setActiveDrawer("radar")}
                onOpenDossier={() => setActiveDrawer("dossier")}
                onToggleContext={() => isMobile || isTablet ? layout.setIsContextDrawerOpen(!layout.isContextDrawerOpen) : layout.toggleRight()}
                isContextOpen={!layout.isRightCollapsed || layout.isContextDrawerOpen}
                onAssumeAttendance={async () => {
                  await conversation.handleUpdateStatus("active");
                  await inbox.refreshThreads();
                }}
                onUpdateStage={handleUpdateLeadStage}
                customStages={customStages}
                isUpdatingStage={isUpdatingStage}
              />
              <MessageList messages={conversation.messages} isLoading={conversation.isLoadingMessages} />
              <Composer
                draft={conversation.messageInput}
                onDraftChange={conversation.handleMessageInputChange}
                attachedFile={conversation.attachedFile}
                onAttachFile={conversation.setAttachedFile}
                onSend={conversation.handleSendMessage}
                isSending={conversation.isSendingMessage}
                windowInfo={conversation.windowInfo}
                onOpenTemplates={() => setActiveDrawer("template")}
                onOpenCatalog={() => setActiveDrawer("catalog")}
                onOpenFlows={() => setActiveDrawer("flow")}
                onOpenPix={() => setActiveDrawer("pix")}
                isMobile={isMobile}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6, 24px)" }}>
              <EmptyState
                icon={<MessageSquare size={48} />}
                title="Selecione uma conversa"
                description="Escolha um lead na fila de atendimento à esquerda para iniciar o atendimento comercial."
              />
            </div>
          )}
        </main>
      )}

      {/* 3. Context Panel (Desktop Inline, Tablet / Mobile in Drawer) */}
      {!isMobile && !isTablet && !layout.isRightCollapsed && conversation.selectedThread && (
        <ContextPanel
          thread={conversation.selectedThread}
          contact={selectedContact}
          onClose={layout.toggleRight}
          journeyStage={conversation.selectedThread.journeyStage}
          onUpdateStage={handleUpdateLeadStage}
          customStages={customStages}
          isUpdatingStage={isUpdatingStage}
          onEditLead={() => setActiveDrawer("dossier")}
          proposals={proposals}
          onCreateProposal={() => setActiveDrawer("proposal")}
          onUpdateProposalStatus={handleUpdateProposalStatus}
          proposalError={proposalError}
          onGeneratePix={() => setActiveDrawer("pix")}
        />
      )}

      {(isMobile || isTablet) && conversation.selectedThread && (
        <Drawer
          isOpen={layout.isContextDrawerOpen}
          onClose={() => layout.setIsContextDrawerOpen(false)}
          title="Contexto do Lead"
          position={isMobile ? "bottom" : "right"}
        >
          <ContextPanel
            thread={conversation.selectedThread}
            contact={selectedContact}
            onClose={() => layout.setIsContextDrawerOpen(false)}
            journeyStage={conversation.selectedThread.journeyStage}
            onUpdateStage={handleUpdateLeadStage}
            customStages={customStages}
            isUpdatingStage={isUpdatingStage}
            onEditLead={() => setActiveDrawer("dossier")}
            proposals={proposals}
            onCreateProposal={() => setActiveDrawer("proposal")}
            onUpdateProposalStatus={handleUpdateProposalStatus}
            proposalError={proposalError}
            onGeneratePix={() => setActiveDrawer("pix")}
            isMobile={true}
          />
        </Drawer>
      )}

      <CockpitDrawers
        activeDrawer={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        selectedThread={conversation.selectedThread}
        session={session}
        onTemplateSent={conversation.refreshMessages}
        onProposalCreated={() => {
          if (layout.selectedThreadId && session.activeWorkspace?.id && session.token) {
            apiClient.getThreadProposals(session.activeWorkspace.id, layout.selectedThreadId, { token: session.token })
              .then((res) => setProposals(res.items || []));
          }
        }}
        onPixCreated={conversation.refreshMessages}
        onRadarDraftApplied={(draft) => conversation.handleMessageInputChange(draft)}
        onSendProduct={handleSendProduct}
        onSendProducts={handleSendProducts}
        onContactUpdated={(contact) => setSelectedContact(contact)}
      />
    </div>
  );
};

export default CockpitPage;
