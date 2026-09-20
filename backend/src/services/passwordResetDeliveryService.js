'use strict';

const { GmailEmailProvider } = require('./GmailEmailProvider');

function isDevelopmentCodeLoggingEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    String(process.env.PASSWORD_RESET_DEV_LOG_CODE || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

// Create the provider on demand so production credentials are read from the current environment.
function getGmailProvider() {
  return new GmailEmailProvider();
}

function getDeliveryProviderStatus() {
  const provider = getGmailProvider();
  if (provider.isConfigured()) {
    return 'HEALTHY';
  }
  if (isDevelopmentCodeLoggingEnabled() || process.env.NODE_ENV !== 'production') {
    return 'EXTERNAL_CONFIGURATION_REQUIRED';
  }
  return 'MISCONFIGURED';
}

function isPasswordResetDeliveryAvailable() {
  if (isDevelopmentCodeLoggingEnabled()) {
    return true;
  }

  return getGmailProvider().isConfigured();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function deliverPasswordResetCode({
  recipientEmail,
  code,
  challengeId,
}) {
  if (!recipientEmail || !code || !challengeId) {
    throw new Error(
      'Password reset delivery requires recipient email, code and challenge ID.'
    );
  }

  const provider = getGmailProvider();
  const providerConfigured = provider.isConfigured();

  if (isDevelopmentCodeLoggingEnabled()) {
    console.info(
      '[PASSWORD_RESET_DEV] sender=zamorinestatepvtltd.erp@gmail.com challenge=%s recipient=%s code=%s expires=5m',
      challengeId,
      recipientEmail,
      code
    );

    if (!providerConfigured) {
      return {
        delivered: true,
        channel: 'DEVELOPMENT_LOG',
        providerMessageId: null,
      };
    }
  }

  if (!providerConfigured) {
    return {
      delivered: false,
      channel: null,
      providerMessageId: null,
      reason: 'PASSWORD_RESET_DELIVERY_NOT_CONFIGURED',
    };
  }

  const safeCode = escapeHtml(code);

  const subject = 'Zamorin Cafe ERP — Password Recovery Code';

  const text = [
    'Zamorin Cafe ERP',
    '',
    'A password recovery request was received for your account.',
    '',
    `Your recovery code is: ${code}`,
    '',
    'This code expires in 5 minutes.',
    '',
    'If you did not request a password reset, you can ignore this email.',
    '',
    'For your security, never share this recovery code with anyone.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:0 auto;">
      <h2 style="margin-bottom:8px;">Zamorin Cafe ERP</h2>
      <p>A password recovery request was received for your account.</p>

      <p>Your recovery code is:</p>

      <div
        style="
          font-size:32px;
          font-weight:700;
          letter-spacing:8px;
          padding:18px 22px;
          background:#f4f1ea;
          border:1px solid #d8c8a8;
          border-radius:10px;
          text-align:center;
          margin:20px 0;
        "
      >
        ${safeCode}
      </div>

      <p><strong>This code expires in 5 minutes.</strong></p>

      <p>
        If you did not request a password reset, you can safely ignore
        this email.
      </p>

      <p>
        For your security, never share this recovery code with anyone.
      </p>
    </div>
  `;

  try {
    const result = await provider.sendEmail({
      to: recipientEmail,
      from: 'Zamorin Cafe ERP <zamorinestatepvtltd.erp@gmail.com>',
      replyTo: 'zamorinestatepvtltd.erp@gmail.com',
      subject,
      text,
      html,
      isDraft: false,
    });

    console.info(
      '[PASSWORD_RESET_DELIVERY] Successfully sent live recovery email to %s via %s (messageId: %s)',
      recipientEmail,
      result?.channel || 'GMAIL_SMTP',
      result?.providerMessageId || 'N/A'
    );

    return {
      delivered: Boolean(result?.delivered),
      channel: result?.channel || 'GMAIL_API',
      providerMessageId:
        result?.providerMessageId || null,
    };
  } catch (error) {
    return {
      delivered: false,
      channel: 'GMAIL_API',
      providerMessageId: null,
      reason: 'PASSWORD_RESET_DELIVERY_FAILED',
      providerErrorCode:
        typeof error?.code === 'string'
          ? error.code
          : 'GMAIL_DELIVERY_ERROR',
    };
  }
}

/**
 * Derives trusted application origin strictly from configured environment variables.
 * Never derives from untrusted incoming request headers (Host, X-Forwarded-Host)
 * to prevent password reset link poisoning attacks.
 */
function getTrustedApplicationOrigin() {
  const configured =
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_URL;

  if (configured && typeof configured === 'string' && configured.trim()) {
    try {
      const parsed = new URL(configured.trim());
      return parsed.origin;
    } catch (_err) {
      // Fall through to canonical default
    }
  }

  return 'https://app.zamorincafe.com';
}

/**
 * Builds a secure password reset URL strictly bound to the trusted application origin.
 */
function buildTrustedPasswordResetUrl(challengeId, resetToken) {
  const origin = getTrustedApplicationOrigin();
  const url = new URL('/auth/reset-password', origin);
  if (challengeId) {
    url.searchParams.set('challengeId', challengeId);
  }
  if (resetToken) {
    url.searchParams.set('token', resetToken);
  }
  return url.toString();
}

module.exports = {
  isDevelopmentCodeLoggingEnabled,
  isPasswordResetDeliveryAvailable,
  getDeliveryProviderStatus,
  deliverPasswordResetCode,
  getTrustedApplicationOrigin,
  buildTrustedPasswordResetUrl,
};

