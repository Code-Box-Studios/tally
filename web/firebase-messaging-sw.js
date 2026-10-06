/* Generic alerts only. This worker never reads a financial document. */
function tallyIntent(data) {
  const keys = ['reminderId', 'obligationId', 'instanceId'];
  if (!data || Object.keys(data).length !== 3 ||
      keys.some(key => typeof data[key] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data[key]))) return null;
  return Object.fromEntries(keys.map(key => [key, data[key]]));
}
// Register before the Firebase SDK so its default handler cannot open an
// unvalidated target. The app rechecks the current owner's inbox on opening.
self.addEventListener('notificationclick', event => {
  const intent = tallyIntent(event.notification.data?.FCM_MSG?.data ?? event.notification.data);
  event.stopImmediatePropagation();
  event.notification.close();
  const url = new URL('/', self.location.origin);
  const params = new URLSearchParams();
  if (intent) {
    params.set('reminder', intent.reminderId);
    params.set('obligation', intent.obligationId);
    params.set('period', intent.instanceId);
  }
  url.hash = '/settings/reminders/inbox' + (intent ? '?' + params.toString() : '');
  event.waitUntil(self.clients.openWindow(url.href));
});
importScripts('/tally-messaging-config.js');
if (self.TALLY_MESSAGING_CONFIG) {
  importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
  firebase.initializeApp(self.TALLY_MESSAGING_CONFIG);
  firebase.messaging().onBackgroundMessage(message => {
    // Notification payloads are displayed by FCM. Never display a second alert.
    if (message.notification) return;
    const intent = tallyIntent(message.data);
    if (!intent) return;
    return self.registration.showNotification('Tally reminder', {
      body: 'Open Tally to see what’s due.', data: intent, tag: intent.reminderId,
    });
  });
}
