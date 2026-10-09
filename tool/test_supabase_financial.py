#!/usr/bin/env python3
import shutil
"""Exercise the actual isolated Auth, Edge, and SQL API without logging secrets."""
import base64
import hashlib
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
CLI = os.environ.get('TALLY_SUPABASE_CLI') or shutil.which('supabase') or '/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase'


def main():
    status = json.loads(subprocess.check_output([CLI, 'status', '-o', 'json'], cwd=ROOT, stderr=subprocess.DEVNULL))
    base = status['API_URL']
    if base != 'http://127.0.0.1:56321':
        raise RuntimeError('Financial tests require the isolated Tally local stack.')
    public = status['ANON_KEY']
    admin = status['SERVICE_ROLE_KEY']
    owners = []
    checks = 0

    def request(path, body=None, token=None, key=None, method=None):
        req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
                                     method=method, headers={'apikey': key or public,
                                     'Authorization': 'Bearer ' + (token or public), 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def check(condition, name):
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print('PASS', name, flush=True)

    def new_owner():
        email = 'tally-test-' + uuid.uuid4().hex + '@example.com'
        password = secrets.token_urlsafe(32)
        code, user = request('/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True}, admin, admin)
        check(code == 200, 'Local QA identity created')
        owners.append(user['id'])
        code, session = request('/auth/v1/token?grant_type=password', {'email': email, 'password': password})
        check(code == 200, 'Email/password signs into real Supabase Auth')
        return user['id'], session['access_token']

    def action(owner, token, name, payload, command=None):
        envelope = {'commandId': command or uuid.uuid4().hex, 'expectedOwnerUid': owner, 'payload': payload}
        return request('/functions/v1/tally-api', {'name': name, 'input': envelope}, token)

    def document(token, table, identity):
        code, rows = request('/rest/v1/tally_' + table + '?id=eq.' + identity + '&select=data', token=token)
        check(code == 200 and len(rows) == 1, 'Owner reads canonical ' + table)
        return rows[0]['data']

    try:
        alice, alice_token = new_owner()
        code, bootstrap = request('/functions/v1/tally-api', {'name': 'bootstrapUser', 'input': {}}, alice_token)
        check(code == 200 and bootstrap['result']['profile']['userId'] == alice, 'Protected profile bootstrap works')
        today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)).date().isoformat()
        payload = {'title': 'Private loan', 'description': '', 'notes': '', 'direction': 'owedByMe',
                   'currency': 'PHP', 'amountMinor': 2000000, 'originationDate': today, 'dueDate': today,
                   'contactId': None, 'categoryId': 'default-personal-loan', 'paymentSourceId': None, 'interestInfo': None}
        cmd = uuid.uuid4().hex
        code, created = action(alice, alice_token, 'createObligation', payload, cmd)
        check(code == 200, 'Create obligation commits parent, period, and activity')
        ids = created['result']
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            retries = list(pool.map(lambda _: action(alice, alice_token, 'createObligation', payload, cmd), range(3)))
        check(all(code == 200 and value['result'] == ids for code, value in retries), 'Concurrent duplicate commands return one receipt')
        code, _ = action(alice, alice_token, 'createObligation', {**payload, 'amountMinor': 1}, cmd)
        check(code == 409, 'Changed payload under a used ID is rejected')
        payment = {'obligationId': ids['obligationId'], 'obligationInstanceId': ids['obligationInstanceId'],
                   'currency': 'PHP', 'paymentDate': today, 'paymentSourceId': None, 'paymentMethod': 'cash', 'notes': ''}
        first_payment = None
        for amount in [500000, 250000, 400000]:
            code, response = action(alice, alice_token, 'recordPayment', {**payment, 'amountMinor': amount})
            check(code == 200, 'Independent partial payment recorded: ' + str(amount))
            first_payment = first_payment or response['result']['paymentId']
        debt = document(alice_token, 'obligations', ids['obligationId'])
        check(debt['totalPaidMinor'] == 1150000 and debt['remainingMinor'] == 850000, '20000 minus 11500 leaves exactly 8500')
        query = {'limit': 1, 'equals': {'entryType': 'payment'}, 'ranges': [],
                 'order': [{'field': 'amountMinor', 'descending': True}], 'after': None}
        code, rows = request('/rest/v1/rpc/tally_read_page', {'collection_name': 'payments', 'request': query}, alice_token)
        check(code == 200 and len(rows) == 2 and rows[0]['data']['amountMinor'] == 500000,
              'Bounded read pages preserve numeric sorting')
        query['after'] = {'id': rows[0]['id'], 'values': {'amountMinor': 500000}}
        code, next_rows = request('/rest/v1/rpc/tally_read_page', {'collection_name': 'payments', 'request': query}, alice_token)
        check(code == 200 and len(next_rows) == 2 and next_rows[0]['data']['amountMinor'] == 400000,
              'Keyset pagination advances without repeating a payment')
        code, _ = action(alice, alice_token, 'recordPayment', {**payment, 'amountMinor': 850001})
        check(code == 400, 'Overpayment cannot create a negative balance')
        code, _ = action(alice, alice_token, 'recordPayment', {**payment, 'amountMinor': 1, 'currency': 'USD'})
        check(code == 400, 'Payment currency cannot cross obligation currency')
        code, corrected = action(alice, alice_token, 'correctPayment', {'paymentId': first_payment, 'expectedObligationRevision': debt['revision'], 'reason': 'Recorded twice', 'replacement': None})
        check(code == 200, 'Correction appends a reversal without rewriting payment history')
        original = document(alice_token, 'payments', first_payment)
        check(original['amountMinor'] == 500000 and original['entryType'] == 'payment', 'Original payment stays unchanged after correction')
        debt = document(alice_token, 'obligations', ids['obligationId'])
        check(debt['totalPaidMinor'] == 650000 and debt['remainingMinor'] == 1350000, 'Reversal recalculates the exact remaining balance')
        code, refreshed = action(alice, alice_token, 'refreshDashboard', {})
        check(code == 200 and refreshed['result']['accepted'], 'Dashboard refresh queues a trusted projection')
        code, worked = request('/functions/v1/tally-worker', {}, admin, admin)
        check(code == 200 and worked.get('processed', 0) > 0, 'Independent server worker processes queued jobs')
        code, summaries = request('/rest/v1/tally_summaries?id=eq.dashboard-PHP&select=data', token=alice_token)
        check(code == 200 and len(summaries) == 1 and summaries[0]['data']['youOweMinor'] == 1350000,
              'Dashboard projection derives exactly 13500 from canonical payment history')
        # Filter JSON fields explicitly; canonical reminders are immutable once visible.
        code, reminders = request('/rest/v1/tally_reminders?data->>visible=eq.true&select=data', token=alice_token)
        check(code == 200 and len(reminders) > 0, 'Due reminder is published without opening the app')
        reminder = reminders[0]['data']
        code, read = action(alice, alice_token, 'markReminderRead',
                            {'reminderId': reminder['reminderId'], 'expectedRevision': reminder['revision']})
        check(code == 200, 'Published reminder supports durable read state')
        content = b'%PDF-1.7\nTally test receipt\n%%EOF\n'
        code, reservation = action(alice, alice_token, 'reserveAttachment',
            {'targetType': 'obligation', 'targetId': ids['obligationId'], 'filename': 'receipt.pdf',
             'contentType': 'application/pdf', 'sizeBytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
        check(code == 200, 'Private attachment reservation verifies its owner and target')
        file_id = reservation['result']['attachmentId']
        upload_payload = {'attachmentId': file_id, 'expectedRevision': 1, 'contentBase64': base64.b64encode(content).decode()}
        upload_command = uuid.uuid4().hex
        code, uploaded = action(alice, alice_token, 'uploadAttachment', upload_payload, upload_command)
        check(code == 200 and uploaded['result']['storageGeneration'] == '1', 'Receipt upload verifies format and checksum')
        code, repeated = action(alice, alice_token, 'uploadAttachment', upload_payload, upload_command)
        check(code == 200 and repeated['result'] == uploaded['result'], 'Lost upload response retries without replacing bytes')
        code, downloaded = action(alice, alice_token, 'downloadAttachment', {'attachmentId': file_id})
        check(code == 200 and base64.b64decode(downloaded['result']['contentBase64']) == content, 'Owner downloads verified private bytes')
        code, _ = request('/storage/v1/object/tally-attachments/users/' + alice + '/attachments/' + file_id + '/content', token=alice_token)
        check(code != 200, 'Direct client Storage reads cannot bypass private file authorization')
        bob, bob_token = new_owner()
        request('/functions/v1/tally-api', {'name': 'bootstrapUser', 'input': {}}, bob_token)
        code, rows = request('/rest/v1/tally_payments?select=id', token=bob_token)
        check(code == 200 and rows == [], 'RLS hides another owner payment history')
        code, _ = action(alice, bob_token, 'recordPayment', {**payment, 'amountMinor': 1})
        check(code == 403, 'Owner envelope cannot impersonate another Auth user')
        code, _ = request('/rest/v1/tally_contacts', {'user_id': alice, 'id': 'forged', 'data': {}}, alice_token)
        check(code in [401, 403], 'Authenticated clients cannot bypass command validation')
        code, _ = request('/rest/v1/rpc/tally_commit_command', {'owner_id': alice, 'command_id': 'forged', 'command_type': 'saveCatalog',
            'payload_hash': 'a' * 64, 'owner_version': 1, 'mutations': [], 'command_result': {}}, alice_token)
        check(code in [401, 403, 404], 'Trusted commit RPC is unavailable to public clients')
        code, _ = action(bob, bob_token, 'downloadAttachment', {'attachmentId': file_id})
        check(code != 200, 'Another user cannot download a private receipt')
        code, accepted = action(alice, alice_token, 'requestAccountDeletion', {'confirmation': 'DELETE'})
        check(code == 200 and accepted['result']['status'] == 'pending', 'Recent login accepts a durable account deletion')
        code, fenced = request('/rest/v1/tally_payments?select=id', token=alice_token)
        check(code == 200 and fenced == [], 'Accepted deletion immediately fences private data on the old JWT')
        code, _ = action(alice, alice_token, 'createObligation', payload)
        check(code != 200, 'Accepted deletion prevents new financial writes')
        code, _ = request('/functions/v1/tally-worker', {}, admin, admin)
        code, removed_user = request('/auth/v1/admin/users/' + alice, token=admin, key=admin)
        check(code == 404, 'Deletion worker removes Auth identity and owned SQL rows')
        code, own_bob = request('/auth/v1/admin/users/' + bob, token=admin, key=admin)
        check(code == 200 and own_bob['id'] == bob, 'Deleting Alice preserves Bob')
        print('Financial integration checks:', checks)
    finally:
        for owner in owners:
            code, _ = request('/auth/v1/admin/users/' + owner, token=admin, key=admin, method='DELETE')
            if code not in (200, 404):
                raise RuntimeError('QA owner cleanup failed; no credentials logged.')


if __name__ == '__main__':
    main()
