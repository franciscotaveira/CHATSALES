#!/usr/bin/env python3
"""
MCT OS Soberano - WAHA Contact & Group Enrichment Engine
Extracts real profile pictures (avatars), pushnames, and contact metadata from WAHA NOWEB,
downloads avatars locally to the ChatbotX storage volume, and updates ChatbotX PostgreSQL.
"""

import os
import sys
import re
import time
import json
import urllib.request
import urllib.error
import psycopg2

WAHA_BASE_URL = "http://172.18.0.8:3000"
WAHA_API_KEY = "70dda19fcf0d68deb12cbf0bb85ddaa1da66b292065ce925275c9ad4390ec44b"
SESSION = "sos-vendas"
WORKSPACE_ID = 11767454538167335

AVATARS_DIR = f"/var/lib/docker/volumes/chatbotx-filesystem-data/_data/chatbotx/public/space/{WORKSPACE_ID}/avatars"
os.makedirs(AVATARS_DIR, exist_ok=True)
os.system(f"chown -R 10001:10001 {AVATARS_DIR}")

def get_db():
    return psycopg2.connect(
        host="127.0.0.1",
        port=15432,
        dbname="chatbotx",
        user="chatbotx",
        password="sovereign_chatbotx_secret_2026"
    )

def fetch_waha_json(path, timeout=10):
    url = f"{WAHA_BASE_URL}{path}"
    req = urllib.request.Request(url, headers={"X-Api-Key": WAHA_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None

def download_avatar(url, dest_path):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = resp.read()
            if len(data) > 200:
                with open(dest_path, "wb") as f:
                    f.write(data)
                os.chmod(dest_path, 0o644)
                os.system(f"chown 10001:10001 {dest_path}")
                return True
    except Exception as e:
        pass
    return False

def clean_digits(phone_str):
    if not phone_str:
        return ""
    return re.sub(r"\D", "", phone_str)

def main():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting WAHA Contact & Avatar Enrichment...")
    conn = get_db()
    cur = conn.cursor()

    # 1. Fetch WAHA Address Book & Groups
    print("Fetching WAHA Address Book contacts...")
    waha_contacts_list = fetch_waha_json(f"/api/contacts/all?session={SESSION}") or []
    print(f"Loaded {len(waha_contacts_list)} contacts from WAHA address book.")

    contacts_by_phone = {}
    contacts_by_id = {}
    for c in waha_contacts_list:
        cid = c.get("id") or ""
        pn = c.get("phoneNumber") or ""
        digits = clean_digits(cid.replace("@c.us", "").replace("@s.whatsapp.net", ""))
        name = (c.get("name") or c.get("pushname") or "").strip()
        if digits:
            contacts_by_phone[digits] = c
        if cid:
            contacts_by_id[cid] = c

    print("Fetching WAHA Groups...")
    waha_groups_dict = fetch_waha_json(f"/api/sos-vendas/groups") or {}
    print(f"Loaded {len(waha_groups_dict)} groups from WAHA.")

    # 2. Query ChatbotX Contacts for Workspace
    cur.execute("""
        SELECT id, "phoneNumber", "firstName", "lastName", avatar
        FROM "Contact"
        WHERE "workspaceId" = %s
        ORDER BY id ASC;
    """, (WORKSPACE_ID,))
    db_contacts = cur.fetchall()
    print(f"Found {len(db_contacts)} contacts in ChatbotX DB for workspace {WORKSPACE_ID}.")

    enriched_names = 0
    enriched_avatars = 0

    for cid, phone, first_name, last_name, avatar in db_contacts:
        is_group = (phone and "@g.us" in phone) or (first_name and "[Grupo]" in first_name)
        new_first_name = first_name
        new_avatar = avatar
        avatar_downloaded = False

        if is_group:
            # Group logic
            group_jid = phone if (phone and "@g.us" in phone) else ""
            if not group_jid and first_name:
                # Try finding in groups by subject
                for gid, ginfo in waha_groups_dict.items():
                    subj = ginfo.get("subject", "")
                    if subj and subj in first_name:
                        group_jid = gid
                        break

            if group_jid:
                gdata = waha_groups_dict.get(group_jid)
                if gdata and gdata.get("subject"):
                    subj = gdata["subject"].strip()
                    formatted_name = f"👥 [Grupo] {subj}"
                    if first_name != formatted_name:
                        new_first_name = formatted_name

                # Avatar check
                avatar_path = f"{AVATARS_DIR}/{cid}.jpg"
                if not avatar or not os.path.exists(avatar_path) or os.path.getsize(avatar_path) < 200:
                    pic_res = fetch_waha_json(f"/api/contacts/profile-picture?session={SESSION}&contactId={urllib.parse.quote(group_jid)}")
                    if pic_res and pic_res.get("profilePictureURL"):
                        if download_avatar(pic_res["profilePictureURL"], avatar_path):
                            new_avatar = f"public/space/{WORKSPACE_ID}/avatars/{cid}.jpg"
                            avatar_downloaded = True
                            enriched_avatars += 1

        else:
            # Individual contact logic
            digits = clean_digits(phone)
            # Find contact info
            cinfo = contacts_by_phone.get(digits)
            if not cinfo and digits:
                cinfo = fetch_waha_json(f"/api/contacts?session={SESSION}&contactId={digits}@c.us")

            if cinfo:
                real_name = (cinfo.get("name") or cinfo.get("pushname") or "").strip()
                # Check if current first_name is empty, just digits, or "Contato +"
                is_placeholder = (
                    not first_name or
                    first_name.startswith("Contato +") or
                    first_name.replace("+", "").isdigit() or
                    first_name == phone
                )
                if real_name and (is_placeholder or first_name != real_name):
                    new_first_name = real_name
                    enriched_names += 1

            # Avatar check
            avatar_path = f"{AVATARS_DIR}/{cid}.jpg"
            if digits and (not avatar or not os.path.exists(avatar_path) or os.path.getsize(avatar_path) < 200):
                pic_res = fetch_waha_json(f"/api/contacts/profile-picture?session={SESSION}&contactId={digits}@c.us")
                if pic_res and pic_res.get("profilePictureURL"):
                    if download_avatar(pic_res["profilePictureURL"], avatar_path):
                        new_avatar = f"public/space/{WORKSPACE_ID}/avatars/{cid}.jpg"
                        avatar_downloaded = True
                        enriched_avatars += 1

        # Update DB if changed
        updates = []
        params = []
        if new_first_name != first_name:
            updates.append('"firstName" = %s')
            params.append(new_first_name)
        if new_avatar != avatar:
            updates.append('avatar = %s')
            params.append(new_avatar)

        if updates:
            params.append(cid)
            set_clause = ", ".join(updates)
            cur.execute(f'UPDATE "Contact" SET {set_clause} WHERE id = %s;', tuple(params))
            conn.commit()
            print(f"Updated contact {cid} ({phone}): Name='{new_first_name}', Avatar={bool(new_avatar)}")

    cur.close()
    conn.close()
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Enrichment Complete! Updated {enriched_names} names, {enriched_avatars} avatars.")

if __name__ == "__main__":
    main()
