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

export type DrawerType = "template" | "proposal" | "pix" | "radar" | "dossier" | "catalog" | "flow" | null;

interface CockpitDrawersProps {
  activeDrawer: DrawerType;
  onClose: () => void;
  selectedThread: CommercialThreadSummary | null;
  session: UseSessionReturn;
  onTemplateSent?: () => void;
  onProposalCreated?: () => void;
  onPixCreated?: () => void;
  onRadarDraftApplied?: (draft: string) => void;
  onSendProduct?: (product: ProductRecord) => void;
  onSendProducts?: (products: ProductRecord[]) => void;
  onContactUpdated?: (contact: ContactSummary) => void;
}

export const CockpitDrawers: FC<CockpitDrawersProps> = ({
  activeDrawer,
  onClose,
  selectedThread,
  session,
  onTemplateSent,
  onProposalCreated,
  onPixCreated,
  onRadarDraftApplied,
  onSendProduct,
  onSendProducts,
  onContactUpdated,
}) => {
  const token = session.token ?? undefined;

  return (
    <>
      <TemplateDrawer
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
        isOpen={activeDrawer === "catalog"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
        onSendProduct={onSendProduct}
        onSendProducts={onSendProducts}
      />
      <FlowDrawer
        isOpen={activeDrawer === "flow"}
        onClose={onClose}
        thread={selectedThread}
        workspaceId={session.activeWorkspace?.id}
        token={token}
      />
    </>
  );
};
