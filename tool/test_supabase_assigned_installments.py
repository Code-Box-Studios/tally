#!/usr/bin/env python3
"""Verify assigned installments against isolated Auth, Edge, and SQL services."""
import datetime
import uuid

from supabase_test_support import LocalBackend


def main():
    backend = LocalBackend()
    try:
        owner = backend.owner()
        uid, token = owner

        def action(name, payload, command=None):
            return backend.action(uid, token, name, payload, command)

        def obligation(identity):
            rows = backend.rows(owner, 'obligations', '&id=eq.' + identity)
            backend.check(len(rows) == 1, 'Owner reads the saved installment')
            return rows[0]['data']

        code, person = action('saveCatalog', {
            'kind': 'contact', 'id': None, 'expectedRevision': None,
            'values': {'kind': 'person', 'displayName': 'Alex', 'organizationType': None,
                       'email': None, 'phone': None, 'address': None, 'notes': '', 'archived': False},
        })
        backend.check(code == 200, 'Person saved in People')
        contact_id = person['result']['id']
        code, account = action('saveCatalog', {
            'kind': 'source', 'id': None, 'expectedRevision': None,
            'values': {'name': 'BPI card', 'type': 'creditCard', 'nickname': None,
                       'lastFour': '1234', 'notes': '', 'active': True},
        })
        backend.check(code == 200, 'Card account saved')
        account_id = account['result']['id']
        today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
        due = (today + datetime.timedelta(days=30)).isoformat()
        terms = {
            'title': "Alex's phone", 'description': '', 'notes': '', 'direction': 'owedByMe',
            'currency': 'PHP', 'amountMinor': 10000, 'originationDate': today.isoformat(),
            'dueDate': due, 'contactId': None, 'categoryId': 'default-installment',
            'paymentSourceId': None, 'interestInfo': None,
            'installments': [{'amountMinor': 5000, 'dueDate': today.isoformat()},
                             {'amountMinor': 5000, 'dueDate': due}],
            'repayment': {'contactId': contact_id, 'accountId': account_id},
        }
        command_id = uuid.uuid4().hex
        code, created = action('createInstallment', terms, command_id)
        backend.check(code == 200, 'One command commits the provider and repayment schedules')
        result = created['result']
        provider_id, repayment_id = result['obligationId'], result['repayment']['obligationId']
        code, repeated = action('createInstallment', terms, command_id)
        backend.check(code == 200 and repeated['result'] == result, 'Retry returns both original schedules')
        provider, repayment = obligation(provider_id), obligation(repayment_id)
        backend.check(provider['linkedObligationId'] == repayment_id and repayment['linkedObligationId'] == provider_id,
                      'Installments link to each other')
        backend.check(provider['contactId'] is None and repayment['contactId'] == contact_id,
                      'Only the repayment belongs to the person')
        backend.check(provider['installmentAccountId'] == account_id and repayment['installmentAccountId'] == account_id,
                      'Both schedules retain the financing account')
        periods = backend.rows(owner, 'obligation_instances')
        backend.check(len(periods) == 4, 'Two separate two-payment schedules exist')
        payment = {'currency': 'PHP', 'paymentDate': today.isoformat(), 'paymentSourceId': None,
                   'paymentMethod': 'cash', 'notes': '', 'explicitAllocations': None}
        code, _ = action('recordInstallmentPayment', {**payment, 'obligationId': provider_id, 'amountMinor': 2500})
        backend.check(code == 200, 'Provider payment recorded')
        backend.check(obligation(provider_id)['remainingMinor'] == 7500 and obligation(repayment_id)['remainingMinor'] == 10000,
                      'Provider payment leaves the person owing the full amount')
        code, _ = action('recordInstallmentPayment', {**payment, 'obligationId': repayment_id, 'amountMinor': 1000})
        backend.check(code == 200, 'Person repayment recorded')
        backend.check(obligation(provider_id)['remainingMinor'] == 7500 and obligation(repayment_id)['remainingMinor'] == 9000,
                      'Person repayment leaves the provider balance unchanged')
        people_debts = backend.rows(owner, 'obligations', '&data->>contactId=eq.' + contact_id)
        backend.check(len(people_debts) == 1 and people_debts[0]['id'] == repayment_id,
                      'People shows the repayment without counting the provider debt')
        backend.worker()
        backend.worker()
        summary = backend.rows(owner, 'summaries', '&id=eq.dashboard-PHP')[0]['data']
        backend.check(summary['youOweMinor'] == 7500 and summary['owedToYouMinor'] == 9000,
                      'Dashboard keeps provider and repayment totals separate')
        maximum = [{ 'amountMinor': 100, 'dueDate': due } for _ in range(120)]
        code, _ = action('createInstallment', {**terms, 'amountMinor': 12000, 'installments': maximum})
        backend.check(code == 200, 'A 120-installment pair fits one real SQL transaction')
        before = len(backend.rows(owner, 'obligations'))
        code, rejected = action('createInstallment', {**terms, 'repayment': {'contactId': contact_id, 'accountId': 'missing'}})
        backend.check(code == 400 and rejected['error']['code'] == 'failed-precondition',
                      'Unavailable account rejects the pair')
        backend.check(len(backend.rows(owner, 'obligations')) == before, 'Rejected creation saves neither side')
        print('Assigned installment integration checks:', backend.checks)
    finally:
        backend.close()


if __name__ == '__main__':
    main()
