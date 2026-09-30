const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1yMAHCsafuQu6hYxBhFD-ST6DDRijIr2hxBDzNkD6CdA',
  HEADER_SCAN_ROWS: 10,
  SESSION_TTL_SECONDS: 20 * 60,
  LOGIN_WINDOW_SECONDS: 10 * 60,
  MAX_FAILED_LOGINS: 8,
  // استبدلها بدومين الموقع فقط، دون شرطة مائلة في النهاية.
  ALLOWED_ORIGIN: 'https://hamadaraburjela-dev.github.io',
  FORM_LINKS: {
    consent: 'https://forms.gle/PystiX718dsEv4zN9',
    groupPayment: 'https://forms.gle/b41YFsyyd5CPAW7C7'
  },
  PAYMENT: {
    phone: '0592210941',
    whatsapp: '970592210941',
    amount: '43 شيكل / $14'
  },
  HEADERS: {
    teamNumber: 'رقم الفريق',
    password: 'رقم السري الخاص بالدخول',
    arabicName: 'الاسم الكامل باللغة العربية',
    englishName: 'الاسم باللغة الإنجليزية',
    membershipPayment: 'حالة الفريق بخصوص دفع رسوم العضوية',
    groupPayment: 'حالة العضو بخصوص رابط الدفع الجماعي',
    consent: 'حالة العضو بخصوص ورقة عدم الممانعة',
    gender: 'الجنس',
    mobile: 'رقم الجوال',
    whatsapp: 'رقم الواتساب',
    email: 'البريد الإلكتروني'
  }
});

function doGet(event) {
  const isBridge = event && event.parameter && event.parameter.bridge === '1';
  if (isBridge) {
    return HtmlService.createHtmlOutput(buildBridgeHtml_())
      .setTitle('IEEEXtreme Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>IEEEXtreme API</title></head><body style="font-family:Arial,sans-serif;' +
    'background:#071b32;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0">' +
    '<main style="text-align:center;padding:32px"><h1>خدمة البيانات تعمل ✓</h1>' +
    '<p style="color:#bcd0df">صفحة الموقع متصلة بالسكريبت.</p></main></body></html>'
  ).setTitle('IEEEXtreme API');
}

/** جسر JavaScript مقيّد بدومين الموقع المحدد في ALLOWED_ORIGIN. */
function buildBridgeHtml_() {
  const allowedOrigin = JSON.stringify(CONFIG.ALLOWED_ORIGIN);
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>' +
    '(function(){' +
    'var allowedOrigin=' + allowedOrigin + ';' +
    'function reply(target,payload){target.postMessage(payload,allowedOrigin);}' +
    'window.addEventListener("message",function(event){' +
    'if(event.origin!==allowedOrigin)return;' +
    'var request=event.data;' +
    'if(!request||request.source!=="ieeextreme-portal"||!request.id)return;' +
    'var allowed=["getTeamNumbers","getTeam","updateMemberEmail"];' +
    'if(allowed.indexOf(request.action)===-1){' +
    'reply(event.source,{source:"ieeextreme-bridge",id:request.id,ok:false,error:"الطلب غير مسموح."});return;}' +
    'var args=Array.isArray(request.args)?request.args:[];' +
    'var runner=google.script.run' +
    '.withSuccessHandler(function(data){reply(event.source,{source:"ieeextreme-bridge",id:request.id,ok:true,data:data});})' +
    '.withFailureHandler(function(error){reply(event.source,{source:"ieeextreme-bridge",id:request.id,ok:false,error:(error&&error.message)||"حدث خطأ غير متوقع."});});' +
    'if(request.action==="getTeamNumbers")runner.getTeamNumbers();' +
    'else if(request.action==="getTeam")runner.getTeam(args[0],args[1]);' +
    'else runner.updateMemberEmail(args[0],args[1],args[2]);' +
    '});' +
    'if(window.parent!==window)window.parent.postMessage({source:"ieeextreme-bridge",ready:true},allowedOrigin);' +
    '})();' +
    '<\/script></body></html>';
}

/** نقطة اتصال إضافية للاختبار من خادم خارجي. */
function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    const action = String(payload.action || '');
    const args = Array.isArray(payload.args) ? payload.args : [];
    const allowedActions = {
      getTeamNumbers: () => getTeamNumbers(),
      getTeam: () => getTeam(args[0], args[1]),
      updateMemberEmail: () => updateMemberEmail(args[0], args[1], args[2])
    };

    if (!allowedActions[action]) throw new Error('الطلب غير مسموح.');
    return jsonResponse_({ ok: true, data: allowedActions[action]() });
  } catch (error) {
    return jsonResponse_({ ok: false, error: cleanServerError_(error) });
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function cleanServerError_(error) {
  return String(error && error.message ? error.message : error || 'حدث خطأ غير متوقع.')
    .replace(/^Exception:\s*/i, '');
}

/** يعيد أرقام الفرق فقط لتغذية قائمة البحث، ولا يعيد أي بيانات شخصية. */
function getTeamNumbers() {
  const source = findDataSource_();
  const lastRow = source.sheet.getLastRow();
  if (lastRow <= source.headerRow) return [];

  const teamColumn = source.columns.teamNumber + 1;
  const values = source.sheet
    .getRange(source.headerRow + 1, teamColumn, lastRow - source.headerRow, 1)
    .getDisplayValues()
    .flat()
    .map(normalizeTeamNumber_)
    .filter(Boolean);

  return [...new Set(values)].sort(compareTeamNumbers_);
}

/** يتحقق من رقم الفريق والرقم السري داخل الخادم ثم يعيد صفوف هذا الفريق فقط. */
function getTeam(teamNumber, password) {
  const normalizedTeam = normalizeTeamNumber_(teamNumber);
  const normalizedPassword = normalizeSecret_(password);

  if (!normalizedTeam || !normalizedPassword) {
    throw new Error('أدخل رقم الفريق والرقم السري.');
  }

  assertLoginAllowed_(normalizedTeam);

  const source = findDataSource_();
  const lastRow = source.sheet.getLastRow();
  const lastColumn = source.sheet.getLastColumn();
  if (lastRow <= source.headerRow) {
    throw new Error('لا توجد بيانات فرق في الشيت حاليًا.');
  }

  const rows = source.sheet
    .getRange(source.headerRow + 1, 1, lastRow - source.headerRow, lastColumn)
    .getDisplayValues();

  const matchingTeamRows = rows
    .map((values, index) => ({ values, rowNumber: source.headerRow + 1 + index }))
    .filter(row => normalizeTeamNumber_(row.values[source.columns.teamNumber]) === normalizedTeam);

  const passwordMatches = matchingTeamRows.some(
    row => normalizeSecret_(row.values[source.columns.password]) === normalizedPassword
  );

  if (!matchingTeamRows.length || !passwordMatches) {
    registerFailedLogin_(normalizedTeam);
    throw new Error('رقم الفريق أو الرقم السري غير صحيح.');
  }

  clearFailedLogins_(normalizedTeam);

  // يكفي تطابق كلمة مرور واحدة للفريق؛ هذا يدعم الشيتات التي تُكتب فيها الكلمة مرة واحدة فقط.
  const members = matchingTeamRows.map(row => ({
    rowNumber: row.rowNumber,
    arabicName: safeText_(row.values[source.columns.arabicName]),
    englishName: safeText_(row.values[source.columns.englishName]),
    gender: safeText_(row.values[source.columns.gender]),
    mobile: safeText_(row.values[source.columns.mobile]),
    whatsapp: safeText_(row.values[source.columns.whatsapp]),
    email: safeText_(row.values[source.columns.email]),
    groupPaymentDone: isMarkedDone_(row.values[source.columns.groupPayment]),
    groupPaymentStatus: safeText_(row.values[source.columns.groupPayment]),
    consentDone: isMarkedDone_(row.values[source.columns.consent]),
    consentStatus: safeText_(row.values[source.columns.consent])
  }));

  const membershipPaid = matchingTeamRows.some(
    row => safeText_(row.values[source.columns.membershipPayment]).length > 0
  );
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    sessionKey_(token),
    JSON.stringify({ teamNumber: normalizedTeam, issuedAt: Date.now() }),
    CONFIG.SESSION_TTL_SECONDS
  );

  return {
    token,
    teamNumber: normalizedTeam,
    teamLabel: `TEAM ${normalizedTeam}`,
    membershipPaid,
    members,
    expiresInMinutes: Math.floor(CONFIG.SESSION_TTL_SECONDS / 60),
    refreshedAt: new Date().toISOString()
  };
}

/** يحدّث بريد عضو داخل الفريق بعد التحقق من جلسة الدخول والصف المستهدف. */
function updateMemberEmail(token, rowNumber, newEmail) {
  const session = getSession_(token);
  const email = String(newEmail || '').trim().toLowerCase();
  const numericRow = Number(rowNumber);

  if (!isValidEmail_(email)) {
    throw new Error('أدخل بريدًا إلكترونيًا صحيحًا.');
  }
  if (!Number.isInteger(numericRow) || numericRow < 2) {
    throw new Error('تعذّر تحديد العضو المطلوب.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const source = findDataSource_();
    if (numericRow > source.sheet.getLastRow()) {
      throw new Error('لم يعد صف العضو موجودًا في الشيت.');
    }

    const rowValues = source.sheet
      .getRange(numericRow, 1, 1, source.sheet.getLastColumn())
      .getDisplayValues()[0];
    const rowTeam = normalizeTeamNumber_(rowValues[source.columns.teamNumber]);

    if (rowTeam !== session.teamNumber) {
      throw new Error('لا تملك صلاحية تعديل بيانات هذا العضو.');
    }

    source.sheet.getRange(numericRow, source.columns.email + 1).setValue(email);
    SpreadsheetApp.flush();

    // تمديد الجلسة بعد أي نشاط ناجح.
    CacheService.getScriptCache().put(
      sessionKey_(token),
      JSON.stringify({ teamNumber: session.teamNumber, issuedAt: session.issuedAt }),
      CONFIG.SESSION_TTL_SECONDS
    );

    return { success: true, email };
  } finally {
    lock.releaseLock();
  }
}

function findDataSource_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const requiredHeaders = Object.values(CONFIG.HEADERS);
  const sheets = spreadsheet.getSheets();

  for (const sheet of sheets) {
    const rowsToScan = Math.min(CONFIG.HEADER_SCAN_ROWS, Math.max(sheet.getLastRow(), 1));
    const columnsToScan = Math.max(sheet.getLastColumn(), requiredHeaders.length);
    const preview = sheet.getRange(1, 1, rowsToScan, columnsToScan).getDisplayValues();

    for (let rowIndex = 0; rowIndex < preview.length; rowIndex += 1) {
      const normalizedHeaders = preview[rowIndex].map(value => String(value || '').trim());
      const hasAllHeaders = requiredHeaders.every(header => normalizedHeaders.includes(header));
      if (!hasAllHeaders) continue;

      const columns = {};
      Object.entries(CONFIG.HEADERS).forEach(([key, header]) => {
        columns[key] = normalizedHeaders.indexOf(header);
      });

      return { sheet, headerRow: rowIndex + 1, columns };
    }
  }

  throw new Error('لم أجد ورقة تحتوي على جميع عناوين الأعمدة المطلوبة. راجع أسماء الأعمدة في الشيت.');
}

function getSession_(token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw new Error('انتهت جلسة الدخول. سجّل الدخول من جديد.');

  const raw = CacheService.getScriptCache().get(sessionKey_(cleanToken));
  if (!raw) throw new Error('انتهت جلسة الدخول. سجّل الدخول من جديد.');
  return JSON.parse(raw);
}

function sessionKey_(token) {
  return `session:${token}`;
}

function assertLoginAllowed_(teamNumber) {
  const attempts = Number(CacheService.getScriptCache().get(loginKey_(teamNumber)) || 0);
  if (attempts >= CONFIG.MAX_FAILED_LOGINS) {
    throw new Error('تم إيقاف محاولات الدخول مؤقتًا لهذا الفريق. حاول بعد 10 دقائق.');
  }
}

function registerFailedLogin_(teamNumber) {
  const cache = CacheService.getScriptCache();
  const key = loginKey_(teamNumber);
  const attempts = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(attempts), CONFIG.LOGIN_WINDOW_SECONDS);
}

function clearFailedLogins_(teamNumber) {
  CacheService.getScriptCache().remove(loginKey_(teamNumber));
}

function loginKey_(teamNumber) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, teamNumber);
  return `login:${Utilities.base64EncodeWebSafe(digest).slice(0, 32)}`;
}

function normalizeTeamNumber_(value) {
  return toEnglishDigits_(value).trim().replace(/\s+/g, '');
}

function normalizeSecret_(value) {
  return toEnglishDigits_(value).trim();
}

function toEnglishDigits_(value) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(value == null ? '' : value)
    .replace(/[٠-٩]/g, digit => arabic.indexOf(digit))
    .replace(/[۰-۹]/g, digit => persian.indexOf(digit));
}

function isMarkedDone_(value) {
  const normalized = safeText_(value).toLowerCase();
  if (!normalized) return false;
  return /تم|مكتمل|معبأ|تعبئت|نعم|done|complete|completed|yes/.test(normalized);
}

function safeText_(value) {
  return String(value == null ? '' : value).trim();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function compareTeamNumbers_(a, b) {
  return String(a).localeCompare(String(b), 'ar', { numeric: true, sensitivity: 'base' });
}
