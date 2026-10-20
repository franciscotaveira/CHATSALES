import {describe,it,expect} from "vitest";
import type {CommercialThreadWithContactRecord} from "@sos-sales/database";
import {formatThread} from "../routes/threads.routes";

const row = {
  id:"SIM-thread", last_message_created_at:new Date("2026-10-18T12:00:00Z"),
  last_message_direction:"inbound",last_message_delivery_status:"delivered",
} as CommercialThreadWithContactRecord;

describe("thread message preview projection",()=>{
  it.each([null,""])("retains an existing message with no text: %s",body=>{
    const result=formatThread({...row,last_message_body:body});
    expect(result.lastMessage).toEqual({body:"",direction:"inbound",createdAt:row.last_message_created_at,deliveryStatus:"delivered"});
  });
  it("retains the recorded text",()=>{
    expect(formatThread({...row,last_message_body:"SIM legenda"}).lastMessage?.body).toBe("SIM legenda");
  });
  it("returns no message when the lateral query found none",()=>{
    expect(formatThread({...row,last_message_created_at:null,last_message_body:null,last_message_direction:null,last_message_delivery_status:null}).lastMessage).toBeNull();
  });
});
