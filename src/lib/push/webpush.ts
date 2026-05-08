import webpush from 'web-push';

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.warn('VAPID keys are missing. Web Push notifications will not work.');
} else {
  webpush.setVapidDetails(
    'mailto:admin@celsornexus.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendPushNotification(subscription: webpush.PushSubscription, payload: object) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error: any) {
    // If the subscription is invalid/expired (410), we should ideally remove it from the DB
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.warn('Push subscription expired or invalid', error);
      return false; // Indicates it should be deleted
    }
    console.error('Error sending push notification', error);
    throw error;
  }
}
