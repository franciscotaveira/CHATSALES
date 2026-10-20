import {describe,it,expect} from "vitest";
import {sanitizeSensitiveUrl} from "../logger";
describe("Sensitive URL redaction",()=>{
 it("removes media tokens while retaining routing and non-secret fields",()=>{
  expect(sanitizeSensitiveUrl("/v1/workspaces/example/media/proxy?mediaId=123&token=synthetic-secret&channelInstanceId=456")).toBe("/v1/workspaces/example/media/proxy?mediaId=123&token=[redacted]&channelInstanceId=456");
 });
 it("redacts ingress paths and repeated auth query values in error text",()=>{
  const result=sanitizeSensitiveUrl("Failed /v1/webhooks/whatsapp/synthetic-ingress?auth=synthetic-auth&access_token=synthetic-access&token=second-secret at handler");
  for(const secret of ["synthetic-ingress","synthetic-auth","synthetic-access","second-secret"])expect(result).not.toContain(secret);
  expect(result).toContain("at handler");
 });
 it("handles missing URLs and leaves ordinary routes intact",()=>{
  expect(sanitizeSensitiveUrl(undefined)).toBe("");expect(sanitizeSensitiveUrl("/v1/contacts?search=cliente")).toBe("/v1/contacts?search=cliente");
 });
});
