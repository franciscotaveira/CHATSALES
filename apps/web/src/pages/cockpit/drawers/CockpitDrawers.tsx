import type { FC } from "react";
import type { UseSessionReturn } from "../../../hooks/useSession";
import type { CommercialThreadSummary, ContactSummary, ProductRecord } from "../../../services/api-client";
import { TemplateDrawer } from "./TemplateDrawer";
import { ProposalDrawer } from "./ProposalDrawer";
import { PixDrawer } from "./PixDrawer";
import { RadarDrawer } from "./RadarDrawer";
import { DossierDrawer } from "./DossierDrawer";
import { CatalogDrawer } from "./CatalogDrawer";
import { FlowDrawer } from "./FlowDrawer";
import { CounterSaleDrawer } from "./CounterSaleDrawer";

export type DrawerType = "template" | "proposal" | "pix" | "radar" | "dossier" | "catalog" | "flow" | "pos" | null;

interface CockpitDrawersProps {
  textSendBlockedReason?:string;
  sendBlockedReason?:string;
  onRefreshChannel?:()=>void;
  isCheckingChannel?:boolean;
  activeDrawer: DrawerType;
  onClose: () => void;
  selectedThread: CommercialThreadSummary | null;
  session: UseSessionReturn;
  onTemplateSent?: () => void|Promise<void>;
  onProposalCreated?: () => void|Promise<void>;
  onPixCreated?: () => void;
  radarCurrentDraft?:string;
  onRadarDraftApplied?: (draft: string) => void;
  onSendProduct?: (product: ProductRecord,idempotencyKey?:string) => void | Promise<void>;
  onSendProducts?: (products: ProductRecord[],idempotencyKey?:string) => void | Promise<void>;
  onContactUpdated?: (contact: ContactSummary) => void;
  onPosSaleCreated?: (result: import("../../../services/api-client").PosSaleResult) => void | Promise<void>;
}

export const CockpitDrawers: FC<CockpitDrawersProps> = ({
  textSendBlockedReason,sendBlockedReason,onRefreshChannel,isCheckingChannel,
  activeDrawer,
  onClose,
  selectedThread,
  session,
  onTemplateSent,
  onProposalCreated,
  onPixCreated,
  radarCurrentDraft,
  onRadarDraftApplied,
  onSendProduct,
  onSendProducts,
  onContactUpdated,
  onPosSaleCreated,
}) => {
  const token = session.token ?? undefined;

  return (
    <>
      <TemplateDrawer
        sendBlockedReason={selectedThread?.channelProvider==="meta_waba"?sendBlockedReason:textSendBlockedReason??sendBlockedReason}
        onRefreshChannel={onRefreshChannel}
        isCheckingChannel={isCheckingChannel}
        isOpen={activeDrawer === "template"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onTemplateSent={onTemplateSent}
      />
      <ProposalDrawer
        isOpen={activeDrawer === "proposal"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onProposalCreated={onProposalCreated}
      />
      <PixDrawer
        sendBlockedReason={textSendBlockedReason??sendBlockedReason}
        onRefreshChannel={onRefreshChannel}
        isCheckingChannel={isCheckingChannel}
        isOpen={activeDrawer === "pix"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onPixCreated={onPixCreated}
      />
      <RadarDrawer
        isOpen={activeDrawer === "radar"}
        onClose={onClose}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        threadId={selectedThread?.id}
        currentDraft={radarCurrentDraft}
        onDraftApplied={onRadarDraftApplied}
      />
      <DossierDrawer
        isOpen={activeDrawer === "dossier"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onContactUpdated={onContactUpdated}
      />
      <CatalogDrawer
        sendBlockedReason={textSendBlockedReason??sendBlockedReason}
        onRefreshChannel={onRefreshChannel}
        isCheckingChannel={isCheckingChannel}
        isOpen={activeDrawer === "catalog"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onSendProduct={onSendProduct}
        onSendProducts={onSendProducts}
      />
      <FlowDrawer
        sendBlockedReason={textSendBlockedReason??sendBlockedReason}
        onRefreshChannel={onRefreshChannel}
        isCheckingChannel={isCheckingChannel}
        isOpen={activeDrawer === "flow"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onFlowQueued={onTemplateSent}
      />
      <CounterSaleDrawer
        isOpen={activeDrawer === "pos"}
        onClose={onClose}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onSaleCreated={onPosSaleCreated}
      />
    </>
  );
};
