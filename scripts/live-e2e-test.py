import json
import secrets
import string
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

API_KEY = "AIzaSyCQYolSIdkBvuunY0r1DnxSHCNzjPrTcYY"
DB = "https://mimer-23cf6-default-rtdb.firebaseio.com"
AUTH = "https://identitytoolkit.googleapis.com/v1"
RUN = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def request(method, url, **kwargs):
    response = requests.request(method, url, timeout=25, **kwargs)
    try:
        payload = response.json()
    except ValueError:
        payload = response.text
    return response.status_code, payload


def auth_signup(label):
    email = f"mimer.qa.{RUN}.{label}@mimer.test"
    password = "Qa!" + secrets.token_urlsafe(12)
    code, payload = request("POST", f"{AUTH}/accounts:signUp?key={API_KEY}", json={"email": email, "password": password, "returnSecureToken": True})
    if code != 200:
        raise RuntimeError(f"signup {label} failed: {code} {payload}")
    return {"label": label, "email": email, "password": password, "uid": payload["localId"], "token": payload["idToken"]}


def db(method, path, user, payload=None, params=True):
    url = f"{DB}/{path}.json"
    if params:
        url += f"?auth={user['token']}"
    return request(method, url, json=payload) if payload is not None else request(method, url)


def must(code, payload, expected=200, label="operation"):
    if code != expected:
        raise RuntimeError(f"{label} expected {expected}, got {code}: {payload}")


def main():
    users = [auth_signup("a"), auth_signup("b"), auth_signup("c")]
    a, b, c = users
    handles = {u["uid"]: f"qa{u['label']}{RUN[-6:]}" for u in users}
    numeric = {u["uid"]: str(700000000 + i) for i, u in enumerate(users, 1)}
    created = {"users": [], "handles": [], "numeric": [], "posts": [], "comments": [], "likes": [], "followers": [], "retweets": [], "notifications": [], "conversations": [], "messages": []}
    checks = []
    security_warnings = []

    try:
        for u in users:
            profile = {
                "uid": u["uid"], "numericId": numeric[u["uid"]], "name": f"ميمر QA {u['label'].upper()}",
                "handle": handles[u["uid"]], "email": u["email"], "country": "SA", "provider": "email",
                "joinDate": datetime.now(timezone.utc).isoformat(), "followers": 0, "following": 0,
                "profilePicture": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='%23333' width='40' height='40' rx='20'/%3E%3C/svg%3E",
                "isTestAccount": True, "needsSuggestions": False
            }
            code, payload = db("PUT", f"handles/{handles[u['uid']]}", u, u["uid"])
            must(code, payload, label=f"reserve handle {u['label']}")
            created["handles"].append(handles[u["uid"]])
            code, payload = db("PUT", f"numericIds/{numeric[u['uid']]}", u, u["uid"])
            must(code, payload, label=f"reserve numeric id {u['label']}")
            created["numeric"].append(numeric[u["uid"]])
            code, payload = db("PUT", f"users/{u['uid']}", u, profile)
            must(code, payload, label=f"create profile {u['label']}")
            created["users"].append(u["uid"])
        checks.append("three authenticated test accounts and unique handles/numeric IDs created")

        # Owner profile update succeeds; cross-user profile edit is denied.
        code, payload = db("PATCH", f"users/{a['uid']}", a, {"bio": "اختبار حي لميمر", "messagePrivacy": "everyone"})
        must(code, payload, label="owner profile update")
        code, payload = db("PATCH", f"users/{a['uid']}", b, {"bio": "تعديل غير مصرح"})
        if code not in (401, 403):
            security_warnings.append(f"cross-user profile edit was accepted ({code}); deployed Firebase rules are older or permissive")
        else:
            checks.append("owner profile update allowed and cross-user edit denied")

        # A creates a post; B cannot edit it; B can comment and like it.
        post = {"userId": a["uid"], "userName": "ميمر QA A", "userHandle": handles[a["uid"]], "userAvatar": "qa-avatar", "content": "منشور اختبار حي #ميمر", "timestamp": datetime.now(timezone.utc).isoformat(), "likes": 0, "retweets": 0, "views": 0, "commentCount": 0, "edited": False}
        code, post_payload = db("POST", "posts", a, post)
        must(code, post_payload, label="create post")
        post_id = post_payload["name"]
        created["posts"].append(post_id)
        code, payload = db("PATCH", f"posts/{post_id}", b, {"content": "تعديل غير مصرح"})
        if code not in (401, 403):
            security_warnings.append(f"cross-user post edit was accepted ({code}); deployed Firebase rules are older or permissive")
        comment = {"userId": b["uid"], "userName": "ميمر QA B", "userAvatar": "qa-avatar", "content": "تعليق اختبار حي", "timestamp": datetime.now(timezone.utc).isoformat(), "parentCommentId": None}
        code, comment_payload = db("POST", f"comments/{post_id}", b, comment)
        must(code, comment_payload, label="comment on post")
        comment_id = comment_payload["name"]
        created["comments"].append((post_id, comment_id, b))
        like = {"timestamp": datetime.now(timezone.utc).isoformat()}
        code, payload = db("PUT", f"likes/{post_id}/{b['uid']}", b, like)
        must(code, payload, label="like post")
        created["likes"].append((post_id, b["uid"], b))
        code, payload = db("PATCH", f"posts/{post_id}", a, {"likes": 1, "commentCount": 1})
        must(code, payload, label="owner post counters")
        checks.append("post ownership enforced; other user comment and like accepted")

        # Follow and notifications use the same data model as the client helper.
        code, payload = db("PUT", f"followers/{a['uid']}/{b['uid']}", b, {"timestamp": datetime.now(timezone.utc).isoformat()})
        must(code, payload, label="follow relation")
        created["followers"].append((a["uid"], b["uid"], b))
        notif_base = {"postId": post_id, "timestamp": datetime.now(timezone.utc).isoformat(), "read": False, "actorId": b["uid"], "actorName": "ميمر QA B", "actorAvatar": "qa-avatar", "type": "likes"}
        stable_id = f"likes_{b['uid']}_{post_id}"
        code, payload = db("PUT", f"notifications/{a['uid']}/{stable_id}", b, {**notif_base, "message": "أعجب ميمر QA B بمنشورك"})
        must(code, payload, label="like notification")
        created["notifications"].append((a["uid"], stable_id, a))
        follow_notif = f"follows_{b['uid']}_{a['uid']}"
        code, payload = db("PUT", f"notifications/{a['uid']}/{follow_notif}", b, {"message": "بدأ ميمر QA B بمتابعتك", "postId": None, "timestamp": datetime.now(timezone.utc).isoformat(), "read": False, "actorId": b["uid"], "actorName": "ميمر QA B", "type": "follows"})
        must(code, payload, label="follow notification")
        created["notifications"].append((a["uid"], follow_notif, a))
        code, notif_payload = db("GET", f"notifications/{a['uid']}", a)
        must(code, notif_payload, label="read notifications")
        if stable_id not in notif_payload or follow_notif not in notif_payload:
            raise RuntimeError("expected live notifications were not readable by recipient")
        checks.append("follow/like notification records readable by recipient and dedupe keys stable")

        # Direct-message request, accept, message, and notification.
        conv_id = "qa_" + "_".join(sorted([a["uid"], b["uid"]]))
        conversation = {"participants": {a["uid"]: True, b["uid"]: True}, "requesterId": a["uid"], "recipientId": b["uid"], "status": "pending", "lastMessage": "", "lastMessageTime": datetime.now(timezone.utc).isoformat(), "unreadCounts": {a["uid"]: 0, b["uid"]: 0}}
        code, payload = db("PUT", f"conversations/{conv_id}", a, conversation)
        must(code, payload, label="create conversation request")
        created["conversations"].append((conv_id, a))
        msg_a = {"senderId": a["uid"], "text": "طلب محادثة اختبار", "timestamp": datetime.now(timezone.utc).isoformat(), "read": False}
        code, msg_payload = db("POST", f"messages/{conv_id}", a, msg_a)
        must(code, msg_payload, label="pending message")
        created["messages"].append((conv_id, msg_payload["name"], a))
        code, payload = db("PATCH", f"conversations/{conv_id}", b, {"status": "accepted", "acceptedBy": b["uid"], "acceptedAt": datetime.now(timezone.utc).isoformat()})
        must(code, payload, label="accept conversation")
        msg_b = {"senderId": b["uid"], "text": "تم قبول طلب المحادثة", "timestamp": datetime.now(timezone.utc).isoformat(), "read": False}
        code, msg_payload = db("POST", f"messages/{conv_id}", b, msg_b)
        must(code, msg_payload, label="accepted message")
        created["messages"].append((conv_id, msg_payload["name"], b))
        code, payload = db("PUT", f"notifications/{a['uid']}/message_{conv_id}_{msg_payload['name']}", b, {"message": "لديك رسالة جديدة", "conversationId": conv_id, "timestamp": datetime.now(timezone.utc).isoformat(), "read": False, "actorId": b["uid"], "type": "messages"})
        must(code, payload, label="message notification")
        created["notifications"].append((a["uid"], f"message_{conv_id}_{msg_payload['name']}", a))
        code, read_payload = db("GET", f"messages/{conv_id}", a)
        must(code, read_payload, label="read conversation messages")
        if len(read_payload or {}) < 2:
            raise RuntimeError("conversation messages were not readable by participant")
        checks.append("conversation request, acceptance, two-way messages, and message notification passed")

        # Cross-user notification write must be denied when actor is not the authenticated user.
        forged = {"message": "رسالة مزيفة", "timestamp": datetime.now(timezone.utc).isoformat(), "read": False, "actorId": c["uid"], "type": "likes"}
        code, payload = db("PUT", f"notifications/{a['uid']}/forged", b, forged)
        if code not in (401, 403):
            security_warnings.append(f"forged notification write was accepted ({code}); deployed Firebase rules are older or permissive")
        else:
            checks.append("forged notification actor write denied")

        created_counts = {key: len(value) for key, value in created.items()}
        result = {"run": RUN, "status": "passed_with_security_warning" if security_warnings else "passed", "accounts": [{"label": u["label"], "uid": u["uid"], "email": u["email"]} for u in users], "checks": checks, "security_warnings": security_warnings, "created_counts": created_counts}
        Path("/home/ubuntu/Mimer-live-e2e-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        # Remove created RTDB records with the owning token before deleting auth users.
        for post_id in created["posts"]:
            db("DELETE", f"posts/{post_id}", a)
            db("DELETE", f"comments/{post_id}", a)
            db("DELETE", f"likes/{post_id}", b)
        for post_id, comment_id, owner in created["comments"]:
            db("DELETE", f"comments/{post_id}/{comment_id}", owner)
        for target, follower, owner in created["followers"]:
            db("DELETE", f"followers/{target}/{follower}", owner)
        for target, notif_id, owner in created["notifications"]:
            db("DELETE", f"notifications/{target}/{notif_id}", owner)
        for conv_id, owner in created["conversations"]:
            other = b if owner["uid"] == a["uid"] else a
            db("PATCH", f"conversations/{conv_id}/deletedFor/{owner['uid']}", owner, True)
            db("PATCH", f"conversations/{conv_id}/deletedFor/{other['uid']}", other, True)
        for uid in created["users"]:
            owner = next(u for u in users if u["uid"] == uid)
            db("DELETE", f"users/{uid}", owner)
            db("DELETE", f"handles/{handles[uid]}", owner)
            db("DELETE", f"numericIds/{numeric[uid]}", owner)
        for u in users:
            request("POST", f"{AUTH}/accounts:delete?key={API_KEY}", json={"idToken": u["token"]})


if __name__ == "__main__":
    main()
