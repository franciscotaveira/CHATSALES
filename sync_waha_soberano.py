#!/usr/bin/env python3
import os
import sys
import time
import json
import random
import re
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
import psycopg2

WAHA_BASE_URL = "http://172.18.0.8:3000"
WAHA_API_KEY = "70dda19fcf0d68deb12cbf0bb85ddaa1da66b292065ce925275c9ad4390ec44b"
SESSION = "sos-vendas"

WORKSPACE_ID = 11767454538167335
INBOX_1ON1_ID = 11767560000000001
INBOX_GROUPS_ID = 11767560000000002

STORAGE_ROOT = f"/var/lib/docker/volumes/chatbotx-filesystem-data/_data/chatbotx/public/space/{WORKSPACE_ID}/conversations"
AVATARS_ROOT = f"/var/lib/docker/volumes/chatbotx-filesystem-data/_data/chatbotx/public/space/{WORKSPACE_ID}/avatars"
os.makedirs(AVATARS_ROOT, exist_ok=True)

def gen_id():
    return int(time.time() * 1000) * 10000 + random.randint(1000, 9999)

def fetch_waha(path, timeout=8):
    url = f"{WAHA_BASE_URL}{path}"
    req = urllib.request.Request(url, headers={"X-Api-Key": WAHA_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None

def download_file(url, target_path, timeout=12):
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    req = urllib.request.Request(url, headers={"X-Api-Key": WAHA_API_KEY, "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            with open(target_path, "wb") as f:
                f.write(data)
            os.chmod(target_path, 0o644)
            return len(data)
    except Exception:
        return 0

def get_db():
    return psycopg2.connect(
        host="127.0.0.1",
        port=15432,
        dbname="chatbotx",
        user="chatbotx",
        password="sovereign_chatbotx_secret_2026"
    )

def enrich_contact_avatar(contact_id, chat_id, is_group):
    avatar_file = f"{AVATARS_ROOT}/{contact_id}.jpg"
    if os.path.exists(avatar_file) and os.path.getsize(avatar_file) > 200:
        return f"public/space/{WORKSPACE_ID}/avatars/{contact_id}.jpg"
        
    encoded_id = urllib.parse.quote(chat_id)
    pic_res = fetch_waha(f"/api/contacts/profile-picture?session={SESSION}&contactId={encoded_id}")
    if pic_res and pic_res.get("profilePictureURL"):
        size = download_file(pic_res["profilePictureURL"], avatar_file)
        if size > 200:
            os.system(f"chown 10001:10001 {avatar_file}")
            return f"public/space/{WORKSPACE_ID}/avatars/{contact_id}.jpg"
    return None

def sync_chat(conn, chat_item, limit=35):
    chat_id = chat_item.get("id")
    if not chat_id or "@broadcast" in chat_id or "@newsletter" in chat_id or "@lid" in chat_id:
        return 0
    
    is_group = "@g.us" in chat_id
    cur = conn.cursor()
    
    clean_digits = "".join([c for c in chat_id if c.isdigit()])
    phone_number = chat_id if is_group else f"+{clean_digits}"
    
    # 1. Resolve contact
    cur.execute('SELECT id, "fullName", avatar FROM "Contact" WHERE "workspaceId" = %s AND "phoneNumber" = %s LIMIT 1', (WORKSPACE_ID, phone_number))
    row = cur.fetchone()
    
    if row:
        contact_id = row[0]
        contact_name = row[1]
        avatar = row[2]
        
        # Check if name is placeholder or missing
        is_placeholder = (
            not contact_name or
            contact_name.startswith("Contato +") or
            contact_name.replace("+", "").isdigit() or
            contact_name == phone_number
        )
        
        updated_name = None
        if is_placeholder:
            if is_group:
                g_info = fetch_waha(f"/api/{SESSION}/groups/{urllib.parse.quote(chat_id)}")
                if g_info and g_info.get("subject"):
                    updated_name = f"👥 [Grupo] {g_info['subject'].strip()}"
            else:
                c_info = fetch_waha(f"/api/contacts?session={SESSION}&contactId={chat_id}")
                if c_info:
                    raw_nm = (c_info.get("name") or c_info.get("pushname") or "").strip()
                    if raw_nm:
                        updated_name = raw_nm
                        
        new_avatar = avatar
        if not avatar:
            new_avatar = enrich_contact_avatar(contact_id, chat_id, is_group)
            
        if updated_name or (new_avatar != avatar):
            set_parts = []
            params = []
            if updated_name:
                set_parts.append('"firstName" = %s')
                params.append(updated_name)
            if new_avatar != avatar and new_avatar:
                set_parts.append('avatar = %s')
                params.append(new_avatar)
            if set_parts:
                params.append(contact_id)
                cur.execute(f'UPDATE "Contact" SET {", ".join(set_parts)} WHERE id = %s', tuple(params))
                conn.commit()
    else:
        contact_id = gen_id()
        raw_name = chat_item.get("name")
        if not raw_name:
            if is_group:
                g_info = fetch_waha(f"/api/{SESSION}/groups/{urllib.parse.quote(chat_id)}")
                raw_name = g_info.get("subject") if g_info else "Grupo WhatsApp"
            else:
                c_info = fetch_waha(f"/api/contacts?session={SESSION}&contactId={chat_id}")
                raw_name = (c_info.get("name") or c_info.get("pushname") or "") if c_info else ""
                
        if not raw_name:
            raw_name = f"Contato {phone_number}"
            
        if is_group and not raw_name.startswith("👥"):
            contact_name = f"👥 [Grupo] {raw_name}"
        else:
            contact_name = raw_name
        
        new_avatar = enrich_contact_avatar(contact_id, chat_id, is_group)
        now = datetime.now(timezone.utc)
        cur.execute('''
            INSERT INTO "Contact" (id, "createdAt", "updatedAt", "phoneNumber", "firstName", "workspaceId", avatar)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        ''', (contact_id, now, now, phone_number, contact_name, WORKSPACE_ID, new_avatar))
        conn.commit()
    
    # 2. Resolve ContactInbox
    target_inbox_id = INBOX_GROUPS_ID if is_group else INBOX_1ON1_ID
    cur.execute('SELECT id FROM "ContactInbox" WHERE "contactId" = %s AND "inboxId" = %s LIMIT 1', (contact_id, target_inbox_id))
    ci_row = cur.fetchone()
    if ci_row:
        contact_inbox_id = ci_row[0]
    else:
        contact_inbox_id = gen_id()
        now = datetime.now(timezone.utc)
        source_type = 'whatsapp_group' if is_group else 'whatsapp'
        cur.execute('''
            INSERT INTO "ContactInbox" (id, "createdAt", "updatedAt", "originalContactId", "contactId", "inboxId", channel, source, "sourceId")
            VALUES (%s, %s, %s, %s, %s, %s, 'api', %s, %s)
        ''', (contact_inbox_id, now, now, contact_id, contact_id, target_inbox_id, source_type, chat_id))
        conn.commit()
    
    # 3. Resolve Conversation
    cur.execute('SELECT id, "archivedAt" FROM "Conversation" WHERE "workspaceId" = %s AND "contactId" = %s LIMIT 1', (WORKSPACE_ID, contact_id))
    conv_row = cur.fetchone()
    now = datetime.now(timezone.utc)
    if conv_row:
        conv_id = conv_row[0]
        if is_group and not conv_row[1]:
            cur.execute('UPDATE "Conversation" SET "archivedAt" = %s, "updatedAt" = %s WHERE id = %s', (now, now, conv_id))
            conn.commit()
        elif not is_group and conv_row[1]:
            cur.execute('UPDATE "Conversation" SET "archivedAt" = NULL, "updatedAt" = %s WHERE id = %s', (now, conv_id))
            conn.commit()
    else:
        conv_id = gen_id()
        archived_at = now if is_group else None
        cur.execute('''
            INSERT INTO "Conversation" (id, "createdAt", "updatedAt", "workspaceId", "contactId", "archivedAt", "lastActivityAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        ''', (conv_id, now, now, WORKSPACE_ID, contact_id, archived_at, now))
        conn.commit()
    
    # 4. Fetch messages from WAHA
    encoded_chat_id = urllib.parse.quote(chat_id)
    msgs = fetch_waha(f"/api/{SESSION}/chats/{encoded_chat_id}/messages?limit={limit}")
    if not msgs:
        return 0
        
    cur.execute('SELECT "sourceId" FROM "Message" WHERE "conversationId" = %s', (conv_id,))
    existing_source_ids = {r[0] for r in cur.fetchall() if r[0]}
    
    inserted = 0
    max_ts = None
    
    for m in msgs:
        source_id = m.get("id")
        if not source_id or source_id in existing_source_ids:
            continue
            
        from_me = m.get("fromMe", False)
        sender_type = "user" if from_me else "contact"
        sender_id = 11767454538167336 if from_me else contact_id
        msg_type = "outbound" if from_me else "inbound"
        
        ts = m.get("timestamp")
        msg_date = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else now
        if not max_ts or msg_date > max_ts:
            max_ts = msg_date
            
        body_text = m.get("body") or ""
        has_media = m.get("hasMedia", False)
        media_data = m.get("media")
        
        msg_id = gen_id()
        
        cur.execute('''
            INSERT INTO "Message" (
                id, "createdAt", "updatedAt", "conversationId", "contactInboxId",
                "workspaceId", text, "messageType", "contentType", "senderType",
                "senderId", "sourceId", type, "sendError"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL)
        ''', (
            msg_id, msg_date, msg_date, conv_id, contact_inbox_id,
            WORKSPACE_ID, body_text if not has_media or body_text else None,
            msg_type, "text", sender_type, sender_id, source_id, "message"
        ))
        
        if has_media and media_data and media_data.get("url"):
            raw_url = media_data["url"]
            if "sos-sales-waha:3000" in raw_url:
                fetch_url = raw_url.replace("sos-sales-waha:3000", "172.18.0.8:3000")
            elif raw_url.startswith("/"):
                fetch_url = f"{WAHA_BASE_URL}{raw_url}"
            else:
                fetch_url = raw_url
                
            orig_filename = os.path.basename(urllib.parse.urlparse(raw_url).path) or f"{msg_id}.dat"
            target_file_path = f"{STORAGE_ROOT}/{conv_id}/{orig_filename}"
            relative_origin_path = f"public/space/{WORKSPACE_ID}/conversations/{conv_id}/{orig_filename}"
            
            file_size = download_file(fetch_url, target_file_path)
            if file_size > 0:
                raw_mime = media_data.get("mimetype") or ""
                if "audio" in raw_mime or orig_filename.endswith((".oga", ".ogg", ".opus")):
                    file_type = "audio"
                    mime_type = "audio/ogg"
                elif "image" in raw_mime or orig_filename.endswith((".jpg", ".jpeg", ".png", ".webp")):
                    file_type = "image"
                    mime_type = "image/jpeg" if orig_filename.endswith((".jpg", ".jpeg")) else ("image/webp" if orig_filename.endswith(".webp") else "image/png")
                elif "video" in raw_mime or orig_filename.endswith(".mp4"):
                    file_type = "video"
                    mime_type = "video/mp4"
                else:
                    file_type = "file"
                    mime_type = raw_mime.split(";")[0] if raw_mime else "application/octet-stream"
                    
                att_id = gen_id()
                cur.execute('''
                    INSERT INTO "Attachment" (
                        id, "createdAt", "updatedAt", "workspaceId", "conversationId",
                        "messageId", "messageCreatedAt", "fileType", "sourceId",
                        "mimeType", size, "originPath", name
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    att_id, msg_date, msg_date, WORKSPACE_ID, conv_id,
                    msg_id, msg_date, file_type, source_id,
                    mime_type, file_size, relative_origin_path, orig_filename
                ))
        
        inserted += 1
    
    if max_ts:
        cur.execute('''
            UPDATE "Conversation"
            SET "lastActivityAt" = %s, "updatedAt" = %s
            WHERE id = %s AND ("lastActivityAt" IS NULL OR "lastActivityAt" < %s)
        ''', (max_ts, now, conv_id, max_ts))
        
    conn.commit()
    return inserted

def run_sync_once():
    chats = fetch_waha(f"/api/{SESSION}/chats?limit=100")
    if not chats:
        return 0
        
    # Sort chats by most recent conversation first
    chats = sorted(chats, key=lambda x: x.get("conversationTimestamp") or x.get("lastMessageRecvTimestamp") or 0, reverse=True)
    
    conn = get_db()
    total_inserted = 0
    
    for c in chats:
        cid = c.get("id")
        try:
            ins = sync_chat(conn, c, limit=35)
            total_inserted += ins
        except Exception:
            conn.rollback()
            
    conn.close()
    return total_inserted

def main():
    daemon = "--daemon" in sys.argv
    if daemon:
        print(f"[{datetime.now().isoformat()}] WAHA Sovereign Sync Daemon starting (interval: 15s)...", flush=True)
        while True:
            try:
                ins = run_sync_once()
                if ins > 0:
                    print(f"[{datetime.now().isoformat()}] Synced +{ins} new WhatsApp messages/media.", flush=True)
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Sync loop error: {e}", flush=True)
            time.sleep(15)
    else:
        print(f"[{datetime.now().isoformat()}] Running single WAHA Sovereign Sync...", flush=True)
        ins = run_sync_once()
        print(f"[{datetime.now().isoformat()}] Sync complete. Total new messages: {ins}", flush=True)

if __name__ == "__main__":
    main()
