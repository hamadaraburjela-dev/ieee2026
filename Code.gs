const SHEET_NAME = 'Sheet1'; // غيّر الاسم إذا كان اسم ورقة البيانات مختلفًا
const CONSENT_FORM_URL = 'https://forms.gle/FHFomr1HzDBeSiZp6';
const GROUP_PAYMENT_FORM_URL = 'https://forms.gle/s81kAiUYuZQ4uCMu5';
const PAYMENT_WHATSAPP = '970592210941';
const OFFICIAL_PORTAL_URL = 'https://ieee2026.vercel.app/';

const HEADERS = {
  teamNumber: 'رقم الفريق',
  password: 'رقم السري الخاص بالدخول',
  fullNameArabic: 'الاسم الكامل باللغة العربية',
  fullNameEnglish: 'الاسم باللغة الإنجليزية',
  membershipPaymentStatus: 'حالة العضو بخصوص دفع رسوم العضوية',
  groupPaymentStatus: 'حالة العضو بخصوص رابط الدفع الجماعي',
  consentStatus: 'حالة العضو بخصوص ورقة عدم الممانعة',
  gender: 'الجنس',
  mobile: 'رقم الجوال',
  whatsapp: 'رقم الواتساب',
  email: 'البريد الإلكتروني',
  shirtSize: 'مقاس التيشيرت',
  teamName: 'اسم الفريق', // اختياري؛ إذا لم يوجد سيظهر TEAM مع الرقم
  teamClassification: 'تصنيف الفريق',
  officialRegistration: 'سجل بشكل رسمي'
};

function doGet() {
  return json_({ ok: true, message: 'IEEEXtreme Team Status API is running.' });
}

// شغّل هذه الدالة مرة واحدة يدويًا من المحرر لمنح صلاحية إرسال البريد.
// لا ترسل أي رسالة؛ تعرض فقط الحصة اليومية المتبقية.
function authorizeMail() {
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log('Mail permission granted. Remaining daily quota: ' + remaining);
  return remaining;
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action === 'login') return login_(payload);
    if (payload.action === 'updateEmail') return updateEmail_(payload);
    if (payload.action === 'updateShirtSize') return updateShirtSize_(payload);
    if (payload.action === 'adminOverview') return adminOverview_(payload);
    if (payload.action === 'adminUpdateMember') return adminUpdateMember_(payload);
    if (payload.action === 'adminUpdateTeam') return adminUpdateTeam_(payload);
    if (payload.action === 'adminCreateMember') return adminCreateMember_(payload);
    if (payload.action === 'adminDeleteMember') return adminDeleteMember_(payload);
    if (payload.action === 'adminPreviewReminder') return adminPreviewReminder_(payload);
    if (payload.action === 'adminSendReminders') return adminSendReminders_(payload);
    throw new Error('طلب غير معروف.');
  } catch (error) {
    return json_({ ok: false, message: error.message || 'حدث خطأ غير متوقع.' });
  }
}

function login_(payload) {
  const teamNumber = clean_(payload.teamNumber);
  const password = clean_(payload.password);
  if (!teamNumber || !password) throw new Error('يرجى إدخال رقم الفريق والرقم السري.');

  const table = table_();
  const teamRows = table.rows.filter(row => clean_(row.values[table.index.teamNumber]) === teamNumber);
  if (!teamRows.length) throw new Error('رقم الفريق غير موجود.');
  if (!teamRows.some(row => clean_(row.values[table.index.password]) === password)) throw new Error('الرقم السري غير صحيح.');

  const members = teamRows.map(row => ({
    rowNumber: row.rowNumber,
    fullNameArabic: value_(row, table, 'fullNameArabic'),
    fullNameEnglish: value_(row, table, 'fullNameEnglish'),
    membershipPaymentStatus: value_(row, table, 'membershipPaymentStatus'),
    groupPaymentStatus: value_(row, table, 'groupPaymentStatus'),
    consentStatus: value_(row, table, 'consentStatus'),
    gender: value_(row, table, 'gender'),
    mobile: value_(row, table, 'mobile'),
    whatsapp: value_(row, table, 'whatsapp'),
    email: value_(row, table, 'email'),
    shirtSize: value_(row, table, 'shirtSize')
  }));

  const teamName = table.index.teamName > -1 ? clean_(teamRows[0].values[table.index.teamName]) : '';
  return json_({ ok: true, data: { teamNumber, teamName: teamName || ('TEAM ' + teamNumber), members } });
}

function updateEmail_(payload) {
  const teamNumber = clean_(payload.teamNumber);
  const password = clean_(payload.password);
  const email = clean_(payload.email);
  const rowNumber = Number(payload.rowNumber);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('البريد الإلكتروني غير صحيح.');
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('بيانات العضو غير صحيحة.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const table = table_();
    const row = table.sheet.getRange(rowNumber, 1, 1, table.headers.length).getDisplayValues()[0];
    if (clean_(row[table.index.teamNumber]) !== teamNumber || clean_(row[table.index.password]) !== password) throw new Error('انتهت الجلسة أو بيانات الدخول غير صحيحة.');
    table.sheet.getRange(rowNumber, table.index.email + 1).setValue(email);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, data: { email } });
}

function updateShirtSize_(payload) {
  const teamNumber = clean_(payload.teamNumber);
  const password = clean_(payload.password);
  const shirtSize = clean_(payload.shirtSize).toUpperCase();
  const rowNumber = Number(payload.rowNumber);
  const allowedSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  if (allowedSizes.indexOf(shirtSize) === -1) throw new Error('مقاس التيشيرت غير صحيح.');
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('بيانات العضو غير صحيحة.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const table = table_();
    const row = table.sheet.getRange(rowNumber, 1, 1, table.headers.length).getDisplayValues()[0];
    if (clean_(row[table.index.teamNumber]) !== teamNumber || clean_(row[table.index.password]) !== password) throw new Error('انتهت الجلسة أو بيانات الدخول غير صحيحة.');
    // العمود L هو العمود رقم 12. نستخدم عنوان العمود إن وُجد، وإلا نكتب مباشرة في L.
    const shirtSizeColumn = table.index.shirtSize > -1 ? table.index.shirtSize + 1 : 12;
    table.sheet.getRange(rowNumber, shirtSizeColumn).setValue(shirtSize);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, data: { shirtSize } });
}

function adminOverview_(payload) {
  verifyAdmin_(payload.adminPassword);
  const table = table_();
  const teamsByNumber = {};
  table.rows.forEach(row => {
    const teamNumber = value_(row, table, 'teamNumber');
    if (!teamNumber) return;
    if (!teamsByNumber[teamNumber]) {
      const teamName = value_(row, table, 'teamName');
      teamsByNumber[teamNumber] = {
        teamNumber: teamNumber,
        teamName: teamName || ('TEAM ' + teamNumber),
        password: value_(row, table, 'password'),
        teamClassification: '',
        officialRegistration: '',
        members: []
      };
    }
    const classificationValue = value_(row, table, 'teamClassification');
    const registrationValue = value_(row, table, 'officialRegistration');
    if (classificationValue) teamsByNumber[teamNumber].teamClassification = classificationValue;
    if (registrationValue) teamsByNumber[teamNumber].officialRegistration = registrationValue;
    const membershipPaymentStatus = value_(row, table, 'membershipPaymentStatus');
    const groupPaymentStatus = value_(row, table, 'groupPaymentStatus');
    const consentStatus = value_(row, table, 'consentStatus');
    const membershipComplete = Boolean(clean_(membershipPaymentStatus));
    const groupPaymentComplete = complete_(groupPaymentStatus);
    const consentComplete = complete_(consentStatus);
    const completed = [membershipComplete, groupPaymentComplete, consentComplete].filter(Boolean).length;
    teamsByNumber[teamNumber].members.push({
      rowNumber: row.rowNumber,
      fullNameArabic: value_(row, table, 'fullNameArabic'),
      fullNameEnglish: value_(row, table, 'fullNameEnglish'),
      membershipPaymentStatus: membershipPaymentStatus,
      groupPaymentStatus: groupPaymentStatus,
      consentStatus: consentStatus,
      membershipComplete: membershipComplete,
      groupPaymentComplete: groupPaymentComplete,
      consentComplete: consentComplete,
      gender: value_(row, table, 'gender'),
      mobile: value_(row, table, 'mobile'),
      whatsapp: value_(row, table, 'whatsapp'),
      email: value_(row, table, 'email'),
      shirtSize: value_(row, table, 'shirtSize'),
      completedRequirements: completed,
      totalRequirements: 3,
      percent: percent_(completed, 3)
    });
  });

  const teams = Object.keys(teamsByNumber).map(key => {
    const team = teamsByNumber[key];
    const completed = team.members.reduce((sum, member) => sum + [member.membershipComplete, member.groupPaymentComplete, member.consentComplete].filter(Boolean).length, 0);
    team.completedRequirements = completed;
    team.totalRequirements = team.members.length * 3;
    team.percent = percent_(completed, team.totalRequirements);
    return team;
  }).sort((a, b) => Number(a.teamNumber) - Number(b.teamNumber) || a.teamNumber.localeCompare(b.teamNumber));

  const members = teams.reduce((sum, team) => sum + team.members.length, 0);
  const completedRequirements = teams.reduce((sum, team) => sum + team.completedRequirements, 0);
  const totalRequirements = members * 3;
  const flatMembers = teams.reduce((all, team) => all.concat(team.members), []);
  const shirtSizes = { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, 'غير محدد': 0 };
  const shirtSizesByGender = {
    male: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, 'غير محدد': 0 },
    female: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, 'غير محدد': 0 },
    unspecified: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, 'غير محدد': 0 }
  };
  flatMembers.forEach(member => {
    const size = clean_(member.shirtSize).toUpperCase();
    const sizeKey = Object.prototype.hasOwnProperty.call(shirtSizes, size) && size ? size : 'غير محدد';
    const genderKey = genderGroup_(member.gender);
    shirtSizes[sizeKey]++;
    shirtSizesByGender[genderKey][sizeKey]++;
  });
  const classifications = { 'مبتدئ': 0, 'متوسط': 0, 'محترف': 0, 'غير محدد': 0 };
  teams.forEach(team => {
    const classification = clean_(team.teamClassification);
    if (Object.prototype.hasOwnProperty.call(classifications, classification) && classification) classifications[classification]++;
    else classifications['غير محدد']++;
  });
  const officialRegisteredTeams = teams.filter(team => clean_(team.officialRegistration) === 'نعم').length;
  const genders = { 'طلاب': 0, 'طالبات': 0, 'غير محدد': 0 };
  flatMembers.forEach(member => {
    const gender = clean_(member.gender).toLowerCase();
    if (gender === 'ذكر' || gender === 'طالب' || gender === 'male' || gender === 'm') genders['طلاب']++;
    else if (gender === 'أنثى' || gender === 'انثى' || gender === 'طالبة' || gender === 'female' || gender === 'f') genders['طالبات']++;
    else genders['غير محدد']++;
  });
  return json_({ ok: true, data: {
    teams: teams,
    stats: {
      teams: teams.length,
      members: members,
      completedRequirements: completedRequirements,
      totalRequirements: totalRequirements,
      overallPercent: percent_(completedRequirements, totalRequirements),
      completeTeams: teams.filter(team => team.percent === 100).length,
      membershipComplete: flatMembers.filter(member => member.membershipComplete).length,
      groupPaymentComplete: flatMembers.filter(member => member.groupPaymentComplete).length,
      consentComplete: flatMembers.filter(member => member.consentComplete).length,
      shirtSizeComplete: flatMembers.filter(member => Boolean(clean_(member.shirtSize))).length,
      shirtSizes: shirtSizes,
      shirtSizesByGender: shirtSizesByGender,
      officialRegisteredTeams: officialRegisteredTeams,
      unofficialTeams: teams.length - officialRegisteredTeams,
      classifications: classifications,
      genders: genders
    }
  }});
}

function adminUpdateMember_(payload) {
  verifyAdmin_(payload.adminPassword);
  const rowNumber = Number(payload.rowNumber);
  const updates = payload.updates || {};
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('رقم صف العضو غير صحيح.');
  if (updates.email && !/^\S+@\S+\.\S+$/.test(clean_(updates.email))) throw new Error('البريد الإلكتروني غير صحيح.');
  const allowedSizes = ['', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  if (allowedSizes.indexOf(clean_(updates.shirtSize).toUpperCase()) === -1) throw new Error('مقاس التيشيرت غير صحيح.');
  const editableKeys = ['fullNameArabic', 'fullNameEnglish', 'email', 'mobile', 'whatsapp', 'gender', 'shirtSize', 'membershipPaymentStatus', 'groupPaymentStatus', 'consentStatus'];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const table = table_();
    if (rowNumber > table.sheet.getLastRow()) throw new Error('لم يتم العثور على العضو.');
    editableKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(updates, key) && table.index[key] > -1) {
        let value = clean_(updates[key]);
        if (key === 'shirtSize') value = value.toUpperCase();
        table.sheet.getRange(rowNumber, table.index[key] + 1).setValue(value);
      }
    });
  } finally { lock.releaseLock(); }
  return json_({ ok: true, data: { rowNumber: rowNumber } });
}

function adminUpdateTeam_(payload) {
  verifyAdmin_(payload.adminPassword);
  const currentTeamNumber = clean_(payload.currentTeamNumber);
  const updates = payload.updates || {};
  const newTeamNumber = clean_(updates.teamNumber);
  const newPassword = clean_(updates.password);
  const teamName = clean_(updates.teamName);
  const teamClassification = clean_(updates.teamClassification);
  const officialRegistration = clean_(updates.officialRegistration);
  if (!currentTeamNumber || !newTeamNumber || !newPassword) throw new Error('رقم الفريق والرقم السري مطلوبان.');
  if (['', 'مبتدئ', 'متوسط', 'محترف'].indexOf(teamClassification) === -1) throw new Error('تصنيف الفريق غير صحيح.');
  if (['', 'نعم', 'لا'].indexOf(officialRegistration) === -1) throw new Error('حالة التسجيل الرسمي غير صحيحة.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let table = table_();
    const rows = table.rows.filter(row => value_(row, table, 'teamNumber') === currentTeamNumber);
    if (!rows.length) throw new Error('لم يتم العثور على الفريق.');
    if (newTeamNumber !== currentTeamNumber && table.rows.some(row => value_(row, table, 'teamNumber') === newTeamNumber)) throw new Error('رقم الفريق الجديد مستخدم لفريق آخر.');
    let teamNameColumn = table.index.teamName;
    if (teamName && teamNameColumn < 0) {
      teamNameColumn = table.headers.length;
      table.sheet.getRange(1, teamNameColumn + 1).setValue(HEADERS.teamName);
    }
    const teamClassificationColumn = ensureColumn_(table, 'teamClassification');
    const officialRegistrationColumn = ensureColumn_(table, 'officialRegistration');
    rows.forEach(row => {
      table.sheet.getRange(row.rowNumber, table.index.teamNumber + 1).setValue(newTeamNumber);
      table.sheet.getRange(row.rowNumber, table.index.password + 1).setValue(newPassword);
      if (teamNameColumn > -1) table.sheet.getRange(row.rowNumber, teamNameColumn + 1).setValue(teamName);
    });
    setTeamLevelValue_(table.sheet, rows, teamClassificationColumn, teamClassification);
    setTeamLevelValue_(table.sheet, rows, officialRegistrationColumn, officialRegistration);
  } finally { lock.releaseLock(); }
  return json_({ ok: true, data: { teamNumber: newTeamNumber } });
}

function adminCreateMember_(payload) {
  verifyAdmin_(payload.adminPassword);
  const teamNumber = clean_(payload.teamNumber);
  const member = payload.member || {};
  if (!teamNumber) throw new Error('رقم الفريق مطلوب.');
  if (!clean_(member.fullNameArabic) && !clean_(member.fullNameEnglish)) throw new Error('اسم العضو مطلوب.');
  if (member.email && !/^\S+@\S+\.\S+$/.test(clean_(member.email))) throw new Error('البريد الإلكتروني غير صحيح.');
  const allowedSizes = ['', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  if (allowedSizes.indexOf(clean_(member.shirtSize).toUpperCase()) === -1) throw new Error('مقاس التيشيرت غير صحيح.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const table = table_();
    const source = table.rows.find(row => value_(row, table, 'teamNumber') === teamNumber);
    if (!source) throw new Error('لم يتم العثور على الفريق.');
    const newRow = new Array(table.headers.length).fill('');
    newRow[table.index.teamNumber] = teamNumber;
    newRow[table.index.password] = value_(source, table, 'password');
    if (table.index.teamName > -1) newRow[table.index.teamName] = value_(source, table, 'teamName');
    const memberKeys = ['fullNameArabic', 'fullNameEnglish', 'email', 'mobile', 'whatsapp', 'gender', 'shirtSize', 'membershipPaymentStatus', 'groupPaymentStatus', 'consentStatus'];
    memberKeys.forEach(key => {
      if (table.index[key] > -1) newRow[table.index[key]] = key === 'shirtSize' ? clean_(member[key]).toUpperCase() : clean_(member[key]);
    });
    table.sheet.appendRow(newRow);
  } finally { lock.releaseLock(); }
  return json_({ ok: true, data: { created: true } });
}

function adminDeleteMember_(payload) {
  verifyAdmin_(payload.adminPassword);
  const rowNumber = Number(payload.rowNumber);
  const confirmationName = clean_(payload.confirmationName);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('رقم صف العضو غير صحيح.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const table = table_();
    const row = table.rows.find(item => item.rowNumber === rowNumber);
    if (!row) throw new Error('لم يتم العثور على العضو.');
    const actualName = value_(row, table, 'fullNameArabic') || value_(row, table, 'fullNameEnglish');
    if (!confirmationName || confirmationName !== actualName) throw new Error('تأكيد حذف العضو غير مطابق.');
    table.sheet.deleteRow(rowNumber);
  } finally { lock.releaseLock(); }
  return json_({ ok: true, data: { deleted: true } });
}

function adminSendReminders_(payload) {
  verifyAdmin_(payload.adminPassword);
  const rowNumbers = Array.isArray(payload.rowNumbers) ? payload.rowNumbers.map(Number).filter(number => Number.isInteger(number) && number >= 2) : [];
  const subject = clean_(payload.subject);
  const deadline = clean_(payload.deadline);
  const extraMessage = clean_(payload.extraMessage);
  if (!rowNumbers.length || rowNumbers.length > 5) throw new Error('اختر من 1 إلى 5 أشخاص في دفعة الإرسال الواحدة.');
  if (!subject || subject.length > 120) throw new Error('موضوع الرسالة مطلوب ويجب ألا يتجاوز 120 حرفًا.');
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('صيغة الموعد النهائي غير صحيحة.');
  if (extraMessage.length > 600) throw new Error('الملاحظة الإضافية طويلة جدًا.');

  const uniqueRows = rowNumbers.filter((number, index, values) => values.indexOf(number) === index);
  const table = table_();
  const rowsByNumber = {};
  table.rows.forEach(row => rowsByNumber[row.rowNumber] = row);
  let sent = 0;
  let skipped = 0;
  let remainingQuota = MailApp.getRemainingDailyQuota();

  uniqueRows.forEach(rowNumber => {
    const row = rowsByNumber[rowNumber];
    if (!row) { skipped++; return; }
    const email = value_(row, table, 'email');
    if (!/^\S+@\S+\.\S+$/.test(email)) { skipped++; return; }
    const member = reminderMember_(row, table);
    if (remainingQuota < 1) throw new Error('تم الوصول إلى الحد اليومي لإرسال البريد في Google. أُرسل ' + sent + ' قبل توقف العملية.');
    const message = reminderMessage_(member, subject, deadline, extraMessage);
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: message.text,
      htmlBody: message.html,
      name: 'IEEEXtreme 20.0'
    });
    sent++;
    remainingQuota--;
  });

  return json_({ ok: true, data: { sent: sent, skipped: skipped, remainingQuota: remainingQuota } });
}

function adminPreviewReminder_(payload) {
  verifyAdmin_(payload.adminPassword);
  const rowNumber = Number(payload.rowNumber);
  const subject = clean_(payload.subject) || 'رسالة متابعة IEEEXtreme 20.0';
  const deadline = clean_(payload.deadline);
  const extraMessage = clean_(payload.extraMessage);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('اختر مستلمًا صحيحًا للمعاينة.');
  if (subject.length > 120 || extraMessage.length > 600) throw new Error('بيانات الرسالة أطول من المسموح.');
  const table = table_();
  const row = table.rows.find(item => item.rowNumber === rowNumber);
  if (!row) throw new Error('لم يتم العثور على المستلم.');
  const email = value_(row, table, 'email');
  const member = reminderMember_(row, table);
  const message = reminderMessage_(member, subject, deadline, extraMessage);
  return json_({ ok: true, data: { html: message.html, text: message.text, subject: subject, email: email, name: member.name, teamNumber: member.teamNumber } });
}

function reminderMember_(row, table) {
  const membershipComplete = Boolean(value_(row, table, 'membershipPaymentStatus'));
  const groupPaymentComplete = complete_(value_(row, table, 'groupPaymentStatus'));
  const consentComplete = complete_(value_(row, table, 'consentStatus'));
  const missing = [];
  if (!membershipComplete) missing.push({ key: 'membership', label: 'دفع رسوم عضوية IEEE' });
  if (!groupPaymentComplete) missing.push({ key: 'groupPayment', label: 'تعبئة فورم الدفع الجماعي' });
  if (!consentComplete) missing.push({ key: 'consent', label: 'تعبئة ورقة عدم الممانعة' });
  if (!value_(row, table, 'shirtSize')) missing.push({ key: 'shirtSize', label: 'تحديد مقاس التيشيرت' });
  return {
    name: value_(row, table, 'fullNameArabic') || value_(row, table, 'fullNameEnglish') || 'المشارك/ة',
    teamNumber: value_(row, table, 'teamNumber'),
    teamName: value_(row, table, 'teamName') || ('TEAM ' + value_(row, table, 'teamNumber')),
    password: value_(row, table, 'password'),
    membershipComplete: membershipComplete,
    complete: missing.length === 0,
    missing: missing
  };
}

function reminderMessage_(member, subject, deadline, extraMessage) {
  const deadlineText = deadline ? deadline.split('-').reverse().join('/') : '';
  const missingLabels = member.missing.map(item => item.label);
  const whatsappText = 'السلام عليكم،\n\nأرفق لكم إشعار دفع رسوم عضوية IEEE الخاصة بمشاركتي في IEEEXtreme 20.0.\n\nالاسم: ' + member.name + '\nالفريق: TEAM ' + member.teamNumber + '\nالمبلغ: 43 شيكل / $14\n\nتم التحويل إلى حساب الدفع الجماعي.\n\nسأرفق صورة إشعار عملية التحويل مع هذه الرسالة.\n\nشكرًا لكم.';
  const whatsappUrl = 'https://wa.me/' + PAYMENT_WHATSAPP + '?text=' + encodeURIComponent(whatsappText);
  const actionRows = member.missing.map(item => {
    if (item.key === 'consent') return reminderActionHtml_(item.label, 'تعبئة النموذج الآن', CONSENT_FORM_URL, 'يرجى تعبئة نموذج عدم الممانعة وإرساله.');
    if (item.key === 'groupPayment') return reminderActionHtml_(item.label, 'تعبئة النموذج الآن', GROUP_PAYMENT_FORM_URL, 'يرجى تعبئة نموذج رابط الدفع الجماعي.');
    if (item.key === 'shirtSize') return reminderActionHtml_(item.label, 'فتح الموقع وتحديد المقاس', OFFICIAL_PORTAL_URL, 'سجّل الدخول إلى الموقع الرسمي ثم اختر مقاس التيشيرت المناسب واحفظه.');
    return reminderActionHtml_(item.label, 'إرسال إشعار الدفع', whatsappUrl, 'المبلغ 43 شيكل / $14 إلى 0592210941 عبر جوال باي أو بال باي.');
  }).join('');
  const safeName = html_(member.name);
  const safeTeam = html_(member.teamName);
  const safeExtra = html_(extraMessage).replace(/\n/g, '<br>');
  const safeDeadline = html_(deadlineText);
  const completeNotice = member.complete ? '<div style="margin:18px 0;padding:18px;border:1px solid #a9ead0;border-radius:12px;background:#effcf7;color:#126849;line-height:1.9"><strong style="font-size:17px">شكرًا لك، لقد أكملت جميع المتطلبات بنجاح 🎉</strong><br>نتمنى لك ولفريقك كل التوفيق في مسابقة IEEEXtreme 20.0، وندعوك لمشاركة زملائك المهتمين معلومات المسابقة وتشجيعهم على المشاركة.</div>' : '';
  const paymentNotice = member.membershipComplete ? '<div style="margin:18px 0;padding:16px;border:1px solid #b9e7ef;border-radius:12px;background:#f1fbfd;color:#0b6f80;line-height:1.9"><strong>تم استلام دفعتك بنجاح.</strong><br>تم إرسال طلبكم رسميًا لاستكمال الدفع الرسمي لدى IEEE.</div>' : '';
  const intro = member.complete ? 'يسعدنا إبلاغك بأن ملف مشاركتك ضمن <strong>' + safeTeam + ' — TEAM ' + html_(member.teamNumber) + '</strong> أصبح مكتملًا.' : 'نود تذكيرك بوجود متطلبات ناقصة ضمن تسجيلك في <strong>' + safeTeam + ' — TEAM ' + html_(member.teamNumber) + '</strong>.';
  const heading = member.complete ? 'اكتملت متطلبات مشاركتك' : 'استكمال متطلبات المشاركة';
  const html = '<!doctype html><html dir="rtl" lang="ar" style="direction:rtl"><body dir="rtl" style="margin:0;background:#eef4f8;font-family:Arial,Tahoma,sans-serif;color:#102335;direction:rtl;text-align:right">' +
    '<div dir="rtl" style="max-width:640px;margin:0 auto;padding:28px 14px;direction:rtl;text-align:right"><div style="overflow:hidden;background:#ffffff;border-radius:18px;border:1px solid #dbe7ef;direction:rtl;text-align:right">' +
    '<div style="padding:25px 28px;background:#071a2c;color:#ffffff"><div style="color:#35d6ee;font-size:13px;font-weight:bold">IEEEXtreme 20.0</div><h1 style="margin:8px 0 0;font-size:23px">' + heading + '</h1></div>' +
    '<div dir="rtl" style="padding:28px;direction:rtl;text-align:right"><p style="margin-top:0;font-size:16px;line-height:1.9;text-align:right">مرحبًا <strong>' + safeName + '</strong>،</p>' +
    '<p style="font-size:15px;line-height:1.9">' + intro + '</p>' + completeNotice + paymentNotice +
    '<div dir="rtl" style="margin:18px 0;padding:16px;border:1px solid #cde6ed;border-radius:12px;background:#f3fbfd;text-align:right"><div style="font-weight:bold;color:#0b6f80">بيانات الدخول إلى الموقع الرسمي</div><table role="presentation" dir="rtl" style="width:100%;margin-top:10px;border-collapse:collapse;text-align:right"><tr><td style="padding:5px 0;color:#60778a">رقم الفريق</td><td dir="ltr" style="padding:5px 0;font-weight:bold;text-align:left">' + html_(member.teamNumber) + '</td></tr><tr><td style="padding:5px 0;color:#60778a">الرقم السري</td><td dir="ltr" style="padding:5px 0;font-weight:bold;text-align:left">' + html_(member.password) + '</td></tr></table><a href="' + OFFICIAL_PORTAL_URL + '" style="display:inline-block;margin-top:12px;padding:11px 18px;border-radius:9px;background:#071a2c;color:#35d6ee;text-decoration:none;font-size:13px;font-weight:bold">استكمال البيانات من الموقع الرسمي</a></div>' +
    (member.complete ? '' : '<div style="margin:20px 0;padding:14px 16px;border-radius:12px;background:#fff5e5;color:#7b4b00;font-weight:bold;line-height:1.8">الوقت المتبقي محدود، يرجى إنجاز المطلوب في أقرب وقت حتى لا يتأثر اعتماد مشاركتك.' + (safeDeadline ? '<br>الموعد النهائي: ' + safeDeadline : '') + '</div>') +
    actionRows + (safeExtra ? '<div style="margin-top:20px;padding:14px 16px;border-right:4px solid #18bad4;background:#f2fbfd;line-height:1.8">' + safeExtra + '</div>' : '') +
    (member.complete ? '' : '<p style="margin:24px 0 0;color:#60778a;font-size:13px;line-height:1.8">إذا كنت قد أنجزت أحد المتطلبات مؤخرًا، يرجى تجاهل البند الخاص به حتى يتم تحديث البيانات.</p>') + '</div>' +
    '<div style="padding:16px 28px;background:#f7fafc;color:#7890a2;font-size:12px">فريق متابعة IEEEXtreme 20.0</div></div></div></body></html>';
  const completionText = member.complete ? 'شكرًا لك، لقد أكملت جميع المتطلبات بنجاح. نتمنى لك ولفريقك كل التوفيق في مسابقة IEEEXtreme 20.0، وندعوك لمشاركة زملائك معلومات المسابقة وتشجيعهم على المشاركة.' : 'لديك متطلبات ناقصة ضمن ' + member.teamName + ' — TEAM ' + member.teamNumber + ':\n- ' + missingLabels.join('\n- ') + '\n\nالوقت المتبقي محدود، يرجى إنجاز المطلوب في أقرب وقت.' + (deadlineText ? '\nالموعد النهائي: ' + deadlineText : '');
  const paymentText = member.membershipComplete ? '\n\nتم استلام دفعتك، وتم إرسال طلبكم رسميًا لاستكمال الدفع الرسمي لدى IEEE.' : '';
  const text = 'مرحبًا ' + member.name + '،\n\n' + completionText + paymentText + (extraMessage ? '\n\n' + extraMessage : '') + '\n\nبيانات الدخول إلى الموقع الرسمي:\nرابط الموقع: ' + OFFICIAL_PORTAL_URL + '\nرقم الفريق: ' + member.teamNumber + '\nالرقم السري: ' + member.password + (member.complete ? '' : '\n\nروابط النماذج:\nعدم الممانعة: ' + CONSENT_FORM_URL + '\nالدفع الجماعي: ' + GROUP_PAYMENT_FORM_URL + '\nإشعار دفع العضوية: ' + whatsappUrl) + '\n\nفريق متابعة IEEEXtreme 20.0';
  return { html: html, text: text };
}

function reminderActionHtml_(title, buttonText, url, description) {
  return '<div style="margin:12px 0;padding:16px;border:1px solid #dfe9f0;border-radius:12px"><div style="font-size:15px;font-weight:bold">' + html_(title) + '</div><div style="margin:6px 0 13px;color:#60778a;font-size:13px;line-height:1.7">' + html_(description) + '</div><a href="' + html_(url) + '" style="display:inline-block;padding:10px 16px;border-radius:9px;background:#0bbbd5;color:#06202a;text-decoration:none;font-size:13px;font-weight:bold">' + html_(buttonText) + '</a></div>';
}

function html_(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function verifyAdmin_(candidate) {
  const configured = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!configured) throw new Error('لم يتم إعداد كلمة مرور الإدارة بعد.');
  const supplied = String(candidate == null ? '' : candidate);
  let mismatch = configured.length === supplied.length ? 0 : 1;
  const length = Math.max(configured.length, supplied.length);
  for (let i = 0; i < length; i++) mismatch |= (configured.charCodeAt(i) || 0) ^ (supplied.charCodeAt(i) || 0);
  if (mismatch !== 0) throw new Error('كلمة مرور الإدارة غير صحيحة.');
}

function ensureColumn_(table, key) {
  if (table.index[key] > -1) return table.index[key];
  const columnIndex = table.sheet.getLastColumn();
  table.sheet.getRange(1, columnIndex + 1).setValue(HEADERS[key]);
  table.index[key] = columnIndex;
  return columnIndex;
}

function setTeamLevelValue_(sheet, rows, columnIndex, value) {
  if (!rows.length || columnIndex < 0) return;
  for (let i = 0; i < rows.length; i++) {
    const cell = sheet.getRange(rows[i].rowNumber, columnIndex + 1);
    const mergedRanges = cell.getMergedRanges();
    if (mergedRanges.length) {
      mergedRanges[0].getCell(1, 1).setValue(value);
      return;
    }
  }
  sheet.getRange(rows[0].rowNumber, columnIndex + 1).setValue(value);
}

function complete_(value) {
  const text = clean_(value).toLowerCase();
  return Boolean(text) && (text.indexOf('تم تعبئته') > -1 || text.indexOf('تم الدفع') > -1 || text.indexOf('مكتمل') > -1 || text === 'نعم' || text === 'yes' || text === 'paid');
}

function percent_(completed, total) {
  if (!total) return 0;
  return Math.round((completed / total * 100) * 10) / 10;
}

function table_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('لم يتم العثور على ورقة البيانات: ' + SHEET_NAME);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('ورقة البيانات فارغة.');
  const headers = values[0].map(clean_);
  const comparableHeaders = headers.map(headerKey_);
  const index = {};
  Object.keys(HEADERS).forEach(key => index[key] = comparableHeaders.indexOf(headerKey_(HEADERS[key])));
  // مسار احتياطي للأعمدة الثابتة في الشيت عند وجود مسافات خفية أو دمج بالخلايا.
  if (index.shirtSize < 0 && headers.length >= 12) index.shirtSize = 11; // L
  if (index.teamClassification < 0 && headers.length >= 13) index.teamClassification = 12; // M
  if (index.officialRegistration < 0 && headers.length >= 14) index.officialRegistration = 13; // N
  ['teamNumber', 'password', 'fullNameArabic', 'membershipPaymentStatus', 'groupPaymentStatus', 'consentStatus', 'email'].forEach(key => {
    if (index[key] < 0) throw new Error('العمود المطلوب غير موجود: ' + HEADERS[key]);
  });
  const rows = values.slice(1).map((row, i) => ({ values: row, rowNumber: i + 2 })).filter(row => row.values.some(Boolean));
  return { sheet, headers, index, rows };
}

function value_(row, table, key) {
  return table.index[key] > -1 ? clean_(row.values[table.index[key]]) : '';
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function headerKey_(value) {
  return clean_(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .toLowerCase();
}

function genderGroup_(value) {
  const gender = clean_(value).toLowerCase().replace(/[أإآ]/g, 'ا');
  if (gender === 'ذكر' || gender === 'طالب' || gender === 'male' || gender === 'm') return 'male';
  if (gender === 'انثى' || gender === 'طالبة' || gender === 'female' || gender === 'f') return 'female';
  return 'unspecified';
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
