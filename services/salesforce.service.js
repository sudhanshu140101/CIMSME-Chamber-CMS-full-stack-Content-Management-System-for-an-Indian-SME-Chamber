const axios = require('axios');

const TOKEN_CACHE_TTL_MS = 55 * 60 * 1000;

const BUSINESS_CATEGORY_LABELS = {
  micro: 'Micro Enterprise',
  small: 'Small Enterprise',
  medium: 'Medium Enterprise',
  listed: 'Listed Company'
};

const BUSINESS_TYPE_LABELS = {
  manufacturing: 'Manufacturing',
  trading: 'Trading / Retail / Wholesale',
  services: 'Services',
  construction: 'Construction & Real Estate',
  transport: 'Transport & Logistics',
  agriculture: 'Agriculture & Allied Activities',
  hospitality: 'Hospitality',
  financial: 'Financial & Insurance Services',
  media: 'Media & Creative',
  other: 'Other General Business Activities'
};

const MEMBERSHIP_TYPE_LABELS = {
  annual: 'Annual Membership',
  startup: 'Startup Membership',
  lifetime: 'Lifetime Membership',
  patron: 'Patron Membership'
};

const ANNUAL_TURNOVER_LABELS = {
  15000: 'Upto 2 crores',
  25000: 'Upto 10 Crores',
  40000: 'Upto 50 Crores',
  60000: 'Upto 100 Crores',
  80000: 'Upto 250 Crores',
  100000: 'Upto 500 Crores'
};

const YEARS_IN_BUSINESS_LABELS = {
  '0-1': '0-1 Years (Startup)',
  '1-3': '1-3 Years',
  '3-5': '3-5 Years',
  '5-10': '5-10 Years',
  '10+': '10+ Years'
};

const PAYMENT_STATUS_MAP = {
  pending: 'Pending',
  paid: 'Success',
  failed: 'Failed'
};

let tokenCache = {
  token: null,
  expiresAt: 0
};

function envTrim(name) {
  const value = process.env[name];
  if (value == null || value === '') return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
}

function isSalesforceEnabled() {
  return envTrim('SALESFORCE_ENABLED') === 'true'
    && !!envTrim('SALESFORCE_CLIENT_ID')
    && !!envTrim('SALESFORCE_CLIENT_SECRET')
    && !!envTrim('SALESFORCE_TOKEN_URL')
    && !!envTrim('SALESFORCE_MEMBERSHIP_URL');
}

function toLabel(map, value, fallback = '') {
  const key = String(value || '').trim().toLowerCase();
  return map[key] || fallback || String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPaymentDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();

  // Asia/Kolkata offset +05:30
  const ist = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mi = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+05:30`;
}

function normalizeMobileNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10) return String(phone || '').trim();
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}


const DEFAULT_ANNUAL_TURNOVER_RANGE = 'Upto 2 crores';

function resolveAnnualTurnoverRange(application, options = {}) {
  const fromOptions = String(options.annualTurnoverRange || '').trim();
  if (fromOptions) return fromOptions;

  const membershipType = String(
    application.membershiptype || application.membershipType || ''
  ).trim().toLowerCase();

  // Only annual membership uses fee/turnover-band mapping.
  if (membershipType === 'annual') {
    const fee = toNumber(
      options.membershipFee ?? application.membershipfee ?? application.membershipFee ?? application.annualturnover
    );
    if (ANNUAL_TURNOVER_LABELS[fee]) return ANNUAL_TURNOVER_LABELS[fee];

    const rawTurnover = String(application.annualTurnover || application.annualturnover || '').trim();
    if (ANNUAL_TURNOVER_LABELS[toNumber(rawTurnover)]) {
      return ANNUAL_TURNOVER_LABELS[toNumber(rawTurnover)];
    }
    if (rawTurnover && Number.isNaN(Number(rawTurnover))) {
      return rawTurnover;
    }
  }

  // Salesforce requires this field for Startup/Lifetime/Patron too.
  return DEFAULT_ANNUAL_TURNOVER_RANGE;
}

function mapPaymentStatus(status) {
  const key = String(status || 'pending').trim().toLowerCase();
  return PAYMENT_STATUS_MAP[key] || 'Pending';
}

function buildMembershipPayload(application, options = {}) {
  const membershipFee = toNumber(
    options.membershipFee ?? application.membershipfee ?? application.membershipFee
  );
  const gstAmount = toNumber(
    options.gstAmount ?? (membershipFee > 0 ? Number((membershipFee * 0.18).toFixed(2)) : 0)
  );
  const paymentAmount = toNumber(
    options.paymentAmount ?? application.finalamount ?? application.finalAmount ?? (membershipFee + gstAmount)
  );

  return {
    fullName: String(application.fullname || application.fullName || '').trim(),
    businessName: String(application.businessname || application.businessName || '').trim(),
    email: String(application.email || '').trim().toLowerCase(),
     password: String(options.password || application.passwordPlain || '').trim(),
    mobileNumber: normalizeMobileNumber(application.phone || application.mobileNumber),
    businessCategory: toLabel(
      BUSINESS_CATEGORY_LABELS,
      application.businesscategory || application.businessCategory,
      'Micro Enterprise'
    ),
    businessType: toLabel(
      BUSINESS_TYPE_LABELS,
      application.businesstype || application.businessType,
      'Other General Business Activities'
    ),
    subBusinessActivity: String(
      application.subbusinesscategory || application.subBusinessCategory || application.subBusinessActivity || ''
    ).trim(),
    membershipType: toLabel(
      MEMBERSHIP_TYPE_LABELS,
      application.membershiptype || application.membershipType,
      'Annual Membership'
    ),
    annualTurnoverRange: resolveAnnualTurnoverRange(application, options),
    state: String(application.state || '').trim(),
    city: String(application.city || '').trim(),
    yearsInBusiness: toLabel(
      YEARS_IN_BUSINESS_LABELS,
      application.yearsinbusiness || application.yearsInBusiness,
      '0-1 Years (Startup)'
    ),
    businessAddress: String(application.businessaddress || application.businessAddress || '').trim(),
    udyamRegistrationNumber: String(
      application.udyamregistrationnumber || application.udyamRegistrationNumber || ''
    ).trim(),
    interestedCommittee: String(
      application.interested_community || application.interestedCommittee || ''
    ).trim(),
    membershipFee,
    gstAmount,
    paymentAmount,
    paymentStatus: mapPaymentStatus(options.paymentStatus || application.payment_status || application.paymentStatus),
    memberId: String(application.memberid || application.memberId || '').trim(),
    orderId: String(options.orderId || application.order_id || application.orderId || '').trim(),
    razorpayOrderId: String(options.razorpayOrderId || '').trim(),
    razorpayPaymentId: String(
    options.razorpayPaymentId || options.razorpayOrderId || application.order_id || 'pending'
    ).trim(),
    paymentDate: formatPaymentDate(options.paymentDate),
    pincode: String(application.pincode || '').trim()
  };
}

async function getAccessToken(forceRefresh = false) {
  if (!isSalesforceEnabled()) {
    throw new Error('Salesforce integration is not configured');
  }

  const now = Date.now();
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: envTrim('SALESFORCE_CLIENT_ID'),
    client_secret: envTrim('SALESFORCE_CLIENT_SECRET')
  });

  const response = await axios.post(envTrim('SALESFORCE_TOKEN_URL'), params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  });

  const accessToken = response.data?.access_token;
  if (!accessToken) {
    throw new Error('Salesforce token response missing access_token');
  }

  tokenCache = {
    token: accessToken,
    expiresAt: now + TOKEN_CACHE_TTL_MS
  };

  return accessToken;
}

async function postMembershipPayload(payload, accessToken) {
  return axios.post(envTrim('SALESFORCE_MEMBERSHIP_URL'), payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 20000
  });
}

function getSalesforceErrorDetails(error) {
  const data = error.response?.data;
  return {
    httpStatus: error.response?.status || null,
    message: data?.message || error.message || 'Salesforce API request failed',
    response: data && typeof data === 'object' ? data : null
  };
}

function buildSafePayloadSummary(payload) {
  return {
    memberId: payload.memberId,
    email: payload.email,
    paymentStatus: payload.paymentStatus,
    orderId: payload.orderId,
    razorpayOrderId: payload.razorpayOrderId,
    razorpayPaymentId: payload.razorpayPaymentId,
    businessType: payload.businessType,
    subBusinessActivity: payload.subBusinessActivity,
    membershipType: payload.membershipType,
    annualTurnoverRange: payload.annualTurnoverRange,
    state: payload.state,
    city: payload.city,
    pincode: payload.pincode,
    interestedCommittee: payload.interestedCommittee,
    udyamRegistrationNumber: payload.udyamRegistrationNumber,
    membershipFee: payload.membershipFee,
    gstAmount: payload.gstAmount,
    paymentAmount: payload.paymentAmount,
    hasPassword: !!payload.password
  };
}

async function syncMembershipLead(application, options = {}) {
  if (!isSalesforceEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  if (!application || !application.email) {
    throw new Error('Salesforce sync requires membership application data with email');
  }

  const payload = buildMembershipPayload(application, options);
  if (!payload.memberId) {
    throw new Error('Salesforce sync requires memberId');
  }

  let accessToken = await getAccessToken();
  let response;

  try {
    response = await postMembershipPayload(payload, accessToken);
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      accessToken = await getAccessToken(true);
      response = await postMembershipPayload(payload, accessToken);
    } else {
      const details = getSalesforceErrorDetails(error);
      const err = new Error(details.message);
      err.salesforceDetails = details;
      err.payloadSummary = buildSafePayloadSummary(payload);
      throw err;
    }
  }

  const data = response.data || {};
  if (data.success === false) {
    const err = new Error(data.message || 'Salesforce rejected membership payload');
    err.salesforceDetails = {
      httpStatus: response.status || 200,
      message: data.message || 'Salesforce rejected membership payload',
      response: data
    };
    err.payloadSummary = buildSafePayloadSummary(payload);
    throw err;
  }

  return {
    success: true,
    leadId: data.leadId || null,
    message: data.message || 'Synced to Salesforce',
    memberId: payload.memberId,
    paymentStatus: payload.paymentStatus,
    payloadSummary: buildSafePayloadSummary(payload)
  };
}

function syncMembershipLeadAsync(application, options = {}) {
  return syncMembershipLead(application, options)
    .then((result) => {
      if (result?.skipped) {
        console.log('[Salesforce] Membership sync skipped:', result.reason || 'disabled');
        return result;
      }
      console.log('[Salesforce] Lead synced:', {
        memberId: result.memberId,
        email: application?.email,
        paymentStatus: result.paymentStatus,
        leadId: result.leadId,
        message: result.message
      });
      return result;
    })
    .catch((error) => {
      console.error('[Salesforce] Membership sync failed:', {
        memberId: application?.memberid || application?.memberId,
        email: application?.email,
        paymentStatus: options.paymentStatus,
        message: error.message,
        httpStatus: error.salesforceDetails?.httpStatus || null,
        response: error.salesforceDetails?.response || null,
        payload: error.payloadSummary || null
      });
      return { success: false, error: error.message };
    });
}

async function syncMembershipLeadForOrder(Database, orderId, paymentStatus, paymentMeta = {}) {
  if (!isSalesforceEnabled() || !orderId) return { skipped: true };

  const order = await Database.getPaymentOrder(orderId);
  if (!order) return { skipped: true, reason: 'order_not_found' };

  const rawMembershipData = order.membership_data;
  const membershipData = typeof rawMembershipData === 'string'
    ? JSON.parse(rawMembershipData)
    : rawMembershipData;

  const email = String(membershipData?.email || order.customer_email || '').trim().toLowerCase();
  if (!email) return { skipped: true, reason: 'email_missing' };

  const rows = await Database.query(
    'SELECT * FROM membership_applications WHERE email = ? LIMIT 1',
    [email]
  );
  const application = rows[0];
  if (!application) return { skipped: true, reason: 'application_not_found' };

  return syncMembershipLeadAsync(application, {
    paymentStatus,
    orderId,
    razorpayOrderId: paymentMeta.razorpayOrderId || order.cf_order_id || '',
    razorpayPaymentId: paymentMeta.razorpayPaymentId || paymentMeta.cfPaymentId || '',
    paymentDate: paymentMeta.paymentDate || new Date(),
    membershipFee: membershipData?.baseFee,
    gstAmount: membershipData?.gstAmount,
    paymentAmount: membershipData?.finalAmount || order.amount
  });
}

module.exports = {
  isSalesforceEnabled,
  buildMembershipPayload,
  syncMembershipLead,
  syncMembershipLeadAsync,
  syncMembershipLeadForOrder
};
