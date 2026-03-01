import sgMail from '@sendgrid/mail';
import { v4 as uuidv4 } from 'uuid';
import {
  getContacts,
  addCampaignRecipients,
  markCampaignSent,
  markRecipientSent,
  getCampaignById,
} from '../db/emailDb.js';

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';

export function initSendGrid() {
  const key = process.env.SENDGRID_API_KEY;
  if (key) {
    sgMail.setApiKey(key);
    console.log('SendGrid: API key configured');
    return true;
  }
  console.warn('SendGrid: SENDGRID_API_KEY not set — emails will be simulated');
  return false;
}

function injectTrackingPixel(html, trackingId) {
  const pixel = `<img src="${BASE_URL}/api/email/track/open/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}

function injectUnsubscribeLink(html, trackingId) {
  const link = `${BASE_URL}/api/email/unsubscribe/${trackingId}`;
  const footer = `
    <div style="margin-top:30px;padding-top:15px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#999;">
      <a href="${link}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
    </div>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}</body>`);
  }
  return html + footer;
}

function wrapClickTracking(html, trackingId) {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      const tracked = `${BASE_URL}/api/email/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
      return `href="${tracked}"`;
    }
  );
}

export async function sendCampaign(campaignId) {
  const campaign = getCampaignById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent') throw new Error('Campaign already sent');

  const subscribedContacts = getContacts({ subscribed: true });
  if (subscribedContacts.length === 0) throw new Error('No subscribed contacts');

  const contactIds = subscribedContacts.map(c => c.id);
  const trackingIds = subscribedContacts.map(() => uuidv4());
  addCampaignRecipients(campaignId, contactIds, trackingIds);

  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@cloudfuze.com';
  const fromName = process.env.SENDGRID_FROM_NAME || 'CloudFuze';
  let sentCount = 0;
  const errors = [];

  for (let i = 0; i < subscribedContacts.length; i++) {
    const contact = subscribedContacts[i];
    const tid = trackingIds[i];

    let personalizedHtml = campaign.html_body
      .replace(/\{\{name\}\}/gi, contact.name || 'there')
      .replace(/\{\{email\}\}/gi, contact.email);

    personalizedHtml = wrapClickTracking(personalizedHtml, tid);
    personalizedHtml = injectTrackingPixel(personalizedHtml, tid);
    personalizedHtml = injectUnsubscribeLink(personalizedHtml, tid);

    if (hasSendGrid) {
      try {
        await sgMail.send({
          to: contact.email,
          from: { email: fromEmail, name: fromName },
          subject: campaign.subject.replace(/\{\{name\}\}/gi, contact.name || 'there'),
          html: personalizedHtml,
        });
        markRecipientSent(tid);
        sentCount++;
      } catch (err) {
        errors.push({ email: contact.email, error: err.message });
        console.error(`Failed to send to ${contact.email}:`, err.message);
      }
    } else {
      markRecipientSent(tid);
      sentCount++;
      console.log(`[Simulated] Email sent to ${contact.email} (tracking: ${tid})`);
    }
  }

  markCampaignSent(campaignId, sentCount);
  return { sentCount, totalRecipients: subscribedContacts.length, errors };
}
