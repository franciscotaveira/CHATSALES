import {z} from "zod";
export const updateAiAgentBodySchema = z.object({
  expectedRevision: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  systemPrompt: z.string().max(5000).optional(),
  personality: z
    .enum(["cordial_comercial", "direto_objetivo", "especialista_consultivo", "empatico_acolhedor"])
    .optional(),
  provider: z.enum(["nvidia", "openrouter"]).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().max(300).optional(),
  skills: z
    .object({
      qualify_lead: z.boolean().optional(),
      catalog_offers: z.boolean().optional(),
      pix_charges: z.boolean().optional(),
      appointments: z.boolean().optional(),
      capi_tracking: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  businessRules: z
    .object({
      checkoutValidityMinutes:z.number().int().min(5).max(1440).optional(),
      companyName: z.string().max(200).optional(),
      agentRole: z.string().max(200).optional(),
      valueProposition: z.string().max(1000).optional(),
      niche: z.string().max(100).optional(),
      openingHours: z.string().max(1000).optional(),
      address: z.string().max(1000).optional(),
      cancellationPolicy: z.string().max(1000).optional(),
      paymentMethods: z.string().max(1000).optional(),
      generalRules: z.string().max(2000).optional(),
      objections: z
        .object({
          priceDiscount: z.string().max(2000).optional(),
          thinkAboutIt: z.string().max(2000).optional(),
          guaranteeTrust: z.string().max(2000).optional(),
          deliveryTimeline: z.string().max(2000).optional(),
        })
        .optional(),
      ctaRule: z.boolean().optional(),
      emojiDensity: z.enum(["sober", "moderate", "expressive"]).optional(),
    })
    .passthrough()
    .optional(),
  faq: z
    .array(
      z.object({
        id: z.string().optional(),
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(2000),
      })
    )
    .optional(),
  strictMode: z.boolean().optional(),
  temperature: z.number().min(0).max(1).optional(),
});

export type AiConfigInput=z.infer<typeof updateAiAgentBodySchema>;
export type AiDraftConfig=Omit<AiConfigInput,"apiKey"|"expectedRevision">;
