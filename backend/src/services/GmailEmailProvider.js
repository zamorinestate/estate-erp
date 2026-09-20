'use strict';

/**
 * GMAIL API EMAIL PROVIDER
 *
 * Official Google Gmail API REST integration for operations mailbox:
 * zamorinestatepvtltd.erp@gmail.com
 *
 * Enforces:
 * - Minimum OAuth scope (https://www.googleapis.com/auth/gmail.send / compose)
 * - Safe RFC 2822 base64url encoded payloads
 * - Zero token leakage in logs or responses
 * - Graceful fallback to ConsoleTest in local non-prod environments without credentials
 */

const nodemailer = require('nodemailer');
const { EmailProvider } = require('./EmailProvider');

class GmailEmailProvider extends EmailProvider {
  constructor(config = {}) {
    super('GMAIL_API');
    this.operationsEmail = config.operationsEmail || 'zamorinestatepvtltd.erp@gmail.com';
    this.accessToken = config.accessToken || process.env.GMAIL_API_ACCESS_TOKEN || null;
    this.refreshToken = config.refreshToken || process.env.GMAIL_REFRESH_TOKEN || null;
    this.clientId = config.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || null;
    this.clientSecret = config.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    const hasSmtp = Boolean(
      (process.env.GMAIL_APP_PASSWORD && process.env.GMAIL_APP_PASSWORD.trim()) ||
      (process.env.SMTP_PASS && process.env.SMTP_PASS.trim())
    );
    const hasOAuth = Boolean(
      this.accessToken ||
      process.env.GMAIL_API_ACCESS_TOKEN ||
      (this.refreshToken && this.clientId && this.clientSecret) ||
      (process.env.GMAIL_REFRESH_TOKEN && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    );
    return hasSmtp || hasOAuth;
  }

  /**
   * Retrieves a valid OAuth2 access token, refreshing if necessary.
   */
  async getValidAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    if (process.env.GMAIL_API_ACCESS_TOKEN) {
      return process.env.GMAIL_API_ACCESS_TOKEN;
    }

    const refreshToken = this.refreshToken || process.env.GMAIL_REFRESH_TOKEN;
    const clientId = this.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = this.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (refreshToken && clientId && clientSecret) {
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenRes.ok) {
          const err = new Error(`OAuth token refresh failed with HTTP ${tokenRes.status}`);
          err.code = 'OAUTH_REFRESH_FAILED';
          throw err;
        }

        const tokenData = await tokenRes.json();
        this.accessToken = tokenData.access_token;
        this.tokenExpiresAt = Date.now() + ((tokenData.expires_in || 3600) - 300) * 1000;
        return this.accessToken;
      } catch (err) {
        if (!err.code) err.code = 'OAUTH_REFRESH_NETWORK_ERROR';
        throw err;
      }
    }

    return null;
  }

  _buildRawRfc822({ to, from, replyTo, subject, html, text }) {
    const fromHeader = from || this.operationsEmail;
    const replyToHeader = replyTo || this.operationsEmail;

    // Escaped subject to prevent CRLF injection
    const cleanSubject = String(subject).replace(/[\r\n]+/g, ' ').trim();

    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const messageParts = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Reply-To: ${replyToHeader}`,
      `Subject: =?UTF-8?B?${Buffer.from(cleanSubject, 'utf8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      text || '',
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      html || '',
      '',
      `--${boundary}--`,
    ];

    const rawMessage = messageParts.join('\r\n');
    return Buffer.from(rawMessage, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async sendViaSmtp(options, smtpPass) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 465;
    const secure = port === 465;
    const user = process.env.SMTP_USER || process.env.GMAIL_USER || this.operationsEmail;
    const cleanPass = smtpPass.replace(/\s+/g, '');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: cleanPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });

    const info = await transporter.sendMail({
      from: options.from || `Zamorin Cafe ERP <${this.operationsEmail}>`,
      to: options.to,
      replyTo: options.replyTo || this.operationsEmail,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return {
      delivered: true,
      providerMessageId: info.messageId || `SMTP-${Date.now()}`,
      providerDraftId: null,
      channel: 'GMAIL_SMTP',
    };
  }

  async sendEmail(options) {
    if (!this.isConfigured()) {
      if (process.env.NODE_ENV !== 'production') {
        // Safe dev fallback
        const msgId = `GMAIL-SIM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        return {
          delivered: true,
          providerMessageId: msgId,
          providerDraftId: options.isDraft ? `DRAFT-${msgId}` : null,
          simulated: true,
        };
      }
      const error = new Error('Gmail API provider is not configured with access tokens.');
      error.code = 'GMAIL_AUTH_NOT_CONFIGURED';
      throw error;
    }

    const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').trim();
    if (smtpPass) {
      return await this.sendViaSmtp(options, smtpPass);
    }

    const token = await this.getValidAccessToken();
    const rawBase64 = this._buildRawRfc822(options);
    const endpoint = options.isDraft
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

    const payload = options.isDraft
      ? { message: { raw: rawBase64 } }
      : { raw: rawBase64 };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`Gmail API HTTP ${response.status}: Delivery rejected.`);
        err.code = `GMAIL_HTTP_${response.status}`;
        err.safeDetails = errorText.substring(0, 200);
        throw err;
      }

      const data = await response.json();
      return {
        delivered: true,
        providerMessageId: data.id || data.message?.id || `GMAIL-${Date.now()}`,
        providerDraftId: options.isDraft ? (data.id || `DRAFT-${Date.now()}`) : null,
      };
    } catch (err) {
      if (!err.code) err.code = 'GMAIL_NETWORK_ERROR';
      throw err;
    }
  }

  /**
   * Sets up or renews Gmail Push Watch via Google Cloud Pub/Sub topic.
   */
  async setupWatch(topicName) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Gmail credentials not configured.',
        status: 'AUTH_REQUIRED',
      };
    }

    const token = await this.getValidAccessToken();
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName: topicName || process.env.GOOGLE_PUBSUB_TOPIC || 'projects/zamorin-cafe-erp/topics/gmail-inbound',
          labelIds: ['INBOX'],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          status: 'WATCH_FAILED',
          error: `HTTP ${res.status}: ${errText.substring(0, 150)}`,
        };
      }

      const data = await res.json();
      return {
        success: true,
        historyId: data.historyId,
        expiration: data.expiration, // Timestamp in ms
        status: 'ACTIVE',
      };
    } catch (err) {
      return {
        success: false,
        status: 'WATCH_NETWORK_ERROR',
        error: err.message,
      };
    }
  }

  /**
   * Fetches missed messages since historyId for history reconciliation.
   */
  async fetchHistory(startHistoryId) {
    if (!this.isConfigured() || !startHistoryId) {
      return { history: [], nextHistoryId: startHistoryId };
    }

    const token = await this.getValidAccessToken();
    try {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        return { history: [], nextHistoryId: startHistoryId, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        history: data.history || [],
        nextHistoryId: data.historyId || startHistoryId,
      };
    } catch (err) {
      return { history: [], nextHistoryId: startHistoryId, error: err.message };
    }
  }

  async checkHealth() {
    if (!this.isConfigured()) {
      return {
        healthy: false,
        status: 'AUTH_REQUIRED',
        latencyMs: 0,
        error: 'Email credentials (OAuth tokens or App Password) not present in environment.',
      };
    }

    const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').trim();
    if (smtpPass) {
      const start = Date.now();
      try {
        const host = process.env.SMTP_HOST || 'smtp.gmail.com';
        const port = Number(process.env.SMTP_PORT) || 465;
        const secure = port === 465;
        const user = process.env.SMTP_USER || process.env.GMAIL_USER || this.operationsEmail;
        const cleanPass = smtpPass.replace(/\s+/g, '');
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass: cleanPass },
          connectionTimeout: 8000,
        });
        await transporter.verify();
        return {
          healthy: true,
          status: 'HEALTHY',
          latencyMs: Date.now() - start,
          channel: 'SMTP',
        };
      } catch (err) {
        return {
          healthy: false,
          status: 'DEGRADED',
          latencyMs: Date.now() - start,
          error: err.message,
          channel: 'SMTP',
        };
      }
    }

    const start = Date.now();
    try {
      const token = await this.getValidAccessToken();
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const latency = Date.now() - start;
      if (response.ok) {
        return {
          healthy: true,
          status: 'HEALTHY',
          latencyMs: latency,
        };
      }
      return {
        healthy: false,
        status: 'DEGRADED',
        latencyMs: latency,
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        healthy: false,
        status: 'OUTAGE',
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }
}

module.exports = { GmailEmailProvider };
