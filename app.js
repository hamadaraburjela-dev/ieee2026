(function () {
  "use strict";

  const CONFIG = window.EXTREME_CONFIG || { API_URL: "" };
  const LINKS = {
    consent: "https://forms.gle/FHFomr1HzDBeSiZp6",
    groupPayment: "https://forms.gle/s81kAiUYuZQ4uCMu5",
    whatsapp: "970592210941"
  };

  const demoData = {
    teamNumber: "1042",
    teamName: "Binary Falcons",
    members: [
      { rowNumber: 2, fullNameArabic: "أحمد محمد سليمان", fullNameEnglish: "Ahmad Suleiman", email: "ahmad@example.com", membershipPaymentStatus: "تم الدفع", groupPaymentStatus: "تم تعبئته شكرا لك", consentStatus: "تم تعبئته شكرا لك" },
      { rowNumber: 3, fullNameArabic: "ليان خالد نصار", fullNameEnglish: "Layan Nassar", email: "layan@example.com", membershipPaymentStatus: "", groupPaymentStatus: "تم تعبئته شكرا لك", consentStatus: "" },
      { rowNumber: 4, fullNameArabic: "يزن علي درويش", fullNameEnglish: "Yazan Darwish", email: "yazan@example.com", membershipPaymentStatus: "", groupPaymentStatus: "", consentStatus: "تم تعبئته شكرا لك" }
    ]
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {
    loginView: $("#loginView"), dashboardView: $("#dashboardView"), loginForm: $("#loginForm"),
    teamNumber: $("#teamNumber"), password: $("#password"), loginError: $("#loginError"),
    logoutButton: $("#logoutButton"), demoButton: $("#demoButton"), teamLabel: $("#teamLabel"),
    teamNumberLabel: $("#teamNumberLabel"), membersGrid: $("#membersGrid"), membersCount: $("#membersCount"),
    progressLabel: $("#progressLabel"), progressBar: $("#progressBar"), progressDetails: $("#progressDetails"),
    refreshButton: $("#refreshButton"), setupNotice: $("#setupNotice"), emailDialog: $("#emailDialog"),
    emailMemberName: $("#emailMemberName"), emailInput: $("#emailInput"), emailError: $("#emailError"),
    saveEmailButton: $("#saveEmailButton"), toast: $("#toast"), togglePassword: $("#togglePassword")
  };

  let session = null;
  let editingMember = null;

  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const normalized = (value = "") => String(value).trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/[ًٌٍَُِّْـ]/g, "").replace(/\s+/g, " ");
  const isComplete = (value) => {
    const text = normalized(value);
    return Boolean(text) && (text.includes("تم تعبئته") || text.includes("تم الدفع") || text.includes("مكتمل") || text === "نعم" || text === "yes" || text === "paid");
  };
  const initials = (name) => String(name || "عضو").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");

  async function api(payload) {
    if (!CONFIG.API_URL) throw new Error("DEMO_MODE");
    const response = await fetch(CONFIG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" });
    if (!response.ok) throw new Error("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    const result = await response.json();
    if (!result.ok) throw new Error(result.message || "تعذر إتمام الطلب.");
    return result.data;
  }

  function setLoading(button, active, text) {
    if (!button.dataset.original) button.dataset.original = button.innerHTML;
    button.disabled = active;
    button.innerHTML = active ? text : button.dataset.original;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.setTimeout(() => els.toast.classList.remove("show"), 3000);
  }

  function whatsAppUrl(member) {
    const message = `السلام عليكم،\n\nأرفق لكم إشعار دفع رسوم عضوية IEEE الخاصة بمشاركتي في IEEEXtreme 20.0.\n\nالاسم: ${member.fullNameArabic || member.fullNameEnglish}\nالفريق: TEAM ${session.teamNumber}\nالمبلغ: 43 شيكل / $14\n\nتم التحويل إلى حساب الدفع الجماعي.\n\nسأرفق صورة إشعار عملية التحويل مع هذه الرسالة.\n\nشكرًا لكم.`;
    return `https://wa.me/${LINKS.whatsapp}?text=${encodeURIComponent(message)}`;
  }

  function requirement(title, done, actionText, href, extra = "", extraClass = "") {
    return `<div class="requirement"><div class="requirement-title"><b>${title}</b><span class="status ${done ? "done" : "pending"}">${done ? "مكتمل" : "مطلوب"}</span></div>${done ? '<p class="done-message">تم تعبئته، شكرًا لك.</p>' : `${extra}<a class="action-link ${extraClass}" href="${href}" target="_blank" rel="noopener">${actionText}</a>`}</div>`;
  }

  function renderMember(member, index) {
    // حسب المطلوب: وجود أي قيمة في خانة رسوم العضوية يعني أن الدفع مسجّل.
    const membershipDone = Boolean(normalized(member.membershipPaymentStatus));
    const groupDone = isComplete(member.groupPaymentStatus);
    const consentDone = isComplete(member.consentStatus);
    return `<article class="member-card" style="animation-delay:${index * 70}ms"><div class="member-head"><div class="avatar">${escapeHtml(initials(member.fullNameArabic || member.fullNameEnglish))}</div><div><h2>${escapeHtml(member.fullNameArabic || member.fullNameEnglish || "عضو الفريق")}</h2><p>${escapeHtml(member.fullNameEnglish || "")}</p></div></div><div class="email-row"><span title="${escapeHtml(member.email)}">${escapeHtml(member.email || "لم يُضف بريد إلكتروني")}</span><button type="button" data-edit-email="${index}">تعديل البريد</button></div><div class="requirements">${requirement("ورقة عدم الممانعة", consentDone, "تعبئة نموذج عدم الممانعة", LINKS.consent)}${requirement("رابط الدفع الجماعي", groupDone, "تعبئة نموذج الدفع الجماعي", LINKS.groupPayment)}${requirement("رسوم عضوية IEEE", membershipDone, "تأكيد الدفع عبر واتساب", whatsAppUrl(member), '<p class="payment-info">حوّل <b>43 شيكل</b> إلى <b>0592210941</b> عبر جوال باي أو بال باي.</p>', "whatsapp")}</div></article>`;
  }

  function renderDashboard(data) {
    session.data = data;
    const members = Array.isArray(data.members) ? data.members : [];
    els.teamLabel.textContent = data.teamName || `TEAM ${data.teamNumber}`;
    els.teamNumberLabel.textContent = data.teamNumber;
    els.membersCount.textContent = `${members.length} ${members.length === 1 ? "عضو" : "أعضاء"}`;
    els.membersGrid.innerHTML = members.map(renderMember).join("");
    const completed = members.reduce((sum, member) => sum + [member.membershipPaymentStatus, member.groupPaymentStatus, member.consentStatus].filter(isComplete).length, 0);
    const total = members.length * 3;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    els.progressLabel.textContent = `${percent}%`;
    els.progressDetails.textContent = `تم إنجاز ${completed} من أصل ${total} متطلبات`;
    requestAnimationFrame(() => { els.progressBar.style.width = `${percent}%`; });
    els.loginView.classList.add("hidden");
    els.dashboardView.classList.remove("hidden");
    els.logoutButton.classList.remove("hidden");
    els.setupNotice.classList.toggle("hidden", Boolean(CONFIG.API_URL));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function login(teamNumber, password, demo = false) {
    els.loginError.textContent = "";
    const submit = els.loginForm.querySelector('[type="submit"]');
    setLoading(submit, true, "جاري التحقق...");
    try {
      let data;
      if (demo) {
        data = demoData;
      } else if (!CONFIG.API_URL) {
        throw new Error("لم يتم ربط الشيت بعد. استخدم زر تجربة نسخة العرض أو أضف رابط السكربت.");
      } else {
        data = await api({ action: "login", teamNumber, password });
      }
      session = { teamNumber: data.teamNumber || teamNumber, password, demo: demo || !CONFIG.API_URL, data };
      renderDashboard(data);
    } catch (error) {
      els.loginError.textContent = error.message === "DEMO_MODE" ? "أضف رابط السكربت أولًا." : error.message;
    } finally { setLoading(submit, false, ""); }
  }

  els.loginForm.addEventListener("submit", (event) => { event.preventDefault(); login(els.teamNumber.value.trim(), els.password.value); });
  els.demoButton.addEventListener("click", () => login("1042", "demo", true));
  els.demoButton.classList.toggle("hidden", Boolean(CONFIG.API_URL));
  els.togglePassword.addEventListener("click", () => { const visible = els.password.type === "text"; els.password.type = visible ? "password" : "text"; els.togglePassword.setAttribute("aria-label", visible ? "إظهار الرقم السري" : "إخفاء الرقم السري"); });
  els.logoutButton.addEventListener("click", () => { session = null; els.dashboardView.classList.add("hidden"); els.logoutButton.classList.add("hidden"); els.loginView.classList.remove("hidden"); els.password.value = ""; });
  els.refreshButton.addEventListener("click", async () => {
    if (!session) return;
    setLoading(els.refreshButton, true, "جاري التحديث...");
    try { const data = session.demo ? demoData : await api({ action: "login", teamNumber: session.teamNumber, password: session.password }); renderDashboard(data); showToast("تم تحديث بيانات الفريق."); }
    catch (error) { showToast(error.message); }
    finally { setLoading(els.refreshButton, false, ""); }
  });
  els.membersGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-email]");
    if (!button) return;
    editingMember = session.data.members[Number(button.dataset.editEmail)];
    els.emailMemberName.textContent = editingMember.fullNameArabic || editingMember.fullNameEnglish;
    els.emailInput.value = editingMember.email || "";
    els.emailError.textContent = "";
    els.emailDialog.showModal();
  });
  els.saveEmailButton.addEventListener("click", async () => {
    const email = els.emailInput.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { els.emailError.textContent = "يرجى إدخال بريد إلكتروني صحيح."; return; }
    setLoading(els.saveEmailButton, true, "جاري الحفظ...");
    try {
      if (!session.demo) await api({ action: "updateEmail", teamNumber: session.teamNumber, password: session.password, rowNumber: editingMember.rowNumber, email });
      editingMember.email = email;
      els.emailDialog.close();
      renderDashboard(session.data);
      showToast(session.demo ? "تم تعديل البريد في نسخة العرض." : "تم حفظ البريد الإلكتروني بنجاح.");
    } catch (error) { els.emailError.textContent = error.message; }
    finally { setLoading(els.saveEmailButton, false, ""); }
  });
})();
