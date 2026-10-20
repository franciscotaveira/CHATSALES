import type { FC } from "react";
import type { UseSessionReturn } from "../../hooks/useSession";
export const BillingSection: FC<{ session: UseSessionReturn }> = () => (
  <section><h2>Plano e cobrança</h2><p>Não há assinatura ou saldo verificado conectado a esta tela.</p>
    <p>Custos de mensagens e IA devem ser consultados nos provedores configurados. Nenhuma chave de recarga é oferecida sem integração financeira validada.</p></section>
);
