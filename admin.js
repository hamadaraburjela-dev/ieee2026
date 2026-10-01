(function () {
  "use strict";
  const API_URL = (window.EXTREME_CONFIG || {}).API_URL || "/api/team";
  const $ = (selector) => document.querySelector(selector);
  const els = { loginView: $("#loginView"), dashboard: $("#dashboardView"), loginForm: $("#adminLoginForm"), password: $("#adminPassword"), loginError: $("#loginError"), logout: $("#logoutButton"), refresh: $("#refreshButton"), lastUpdated: $("#lastUpdated"), stats: $("#statsGrid"), overallPercent: $("#overallPercent"), overallBar: $("#overallBar"), breakdown: $("#requirementsBreakdown"), attention: $("#attentionList"), search: $("#searchInput"), filter: $("#statusFilter"), results: $("#resultsCount"), teams: $("#teamsList"), memberDialog: $("#memberDialog"), memberForm: $("#memberForm"), memberTitle: $("#memberDialogTitle"), memberSubtitle: $("#memberDialogSubtitle"), memberError: $("#memberError"), deleteMember: $("#deleteMemberButton"), teamDialog: $("#teamDialog"), teamForm: $("#teamForm"), teamSubtitle: $("#teamDialogSubtitle"), teamError: $("#teamError"), mailDialog: $("#mailDialog"), mailForm: $("#mailForm"), mailAudience: $("#mailAudience"), mailSubject: $("#mailSubject"), mailDeadline: $("#mailDeadline"), mailExtraMessage: $("#mailExtraMessage"), recipientList: $("#recipientList"), selectedRecipientCount: $("#selectedRecipientCount"), missingEmailNote: $("#missingEmailNote"), mailError: $("#mailError"), toggleAllRecipients: $("#toggleAllRecipients"), toast: $("#toast") };
  let adminPassword = "";
  let overview = { teams: [], stats: {} };
  let editingMember = null;
  let editingTeam = null;
  let memberMode = "edit";
  let mailCandidates = [];
  let selectedRecipients = new Set();
  const memberFields = ["fullNameArabic", "fullNameEnglish", "email", "mobile", "whatsapp", "gender", "shirtSize", "membershipPaymentStatus", "groupPaymentStatus", "consentStatus"];

  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const normalized = (value = "") => String(value).trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/[ًٌٍَُِّْـ]/g, "");
  const initials = (name) => String(name || "عضو").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
  const statusBadge = (done, yes = "مكتمل", no = "ناقص") => `<span class="status-badge ${done ? "done" : "pending"}"><i></i>${done ? yes : no}</span>`;
  const percentClass = (percent) => percent === 100 ? "complete" : percent < 50 ? "low" : "medium";
  const formatPercent = (value) => `${Number(value) % 1 === 0 ? Number(value).toFixed(0) : Number(value).toFixed(1)}%`;
  const validEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || "").trim());
  const missingRequirements = (member) => [!member.membershipComplete && "رسوم العضوية", !member.groupPaymentComplete && "فورم الدفع الجماعي", !member.consentComplete && "ورقة عدم الممانعة", !String(member.shirtSize || "").trim() && "مقاس التيشيرت"].filter(Boolean);

  async function api(action, data = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, adminPassword, ...data }), signal: controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.message || "تعذر إتمام الطلب.");
      return result.data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("استغرق الاتصال وقتًا أطول من المتوقع.");
      throw error;
    } finally { clearTimeout(timeout); }
  }

  function loading(button, active, label) { if (!button.dataset.original) button.dataset.original = button.innerHTML; button.disabled = active; button.innerHTML = active ? label : button.dataset.original; }
  function showToast(message, danger = false) { els.toast.textContent = message; els.toast.classList.toggle("danger", danger); els.toast.classList.add("show"); setTimeout(() => els.toast.classList.remove("show"), 3200); }
  function field(name) { return els.memberForm.elements.namedItem(name); }
  function setFieldValue(name, value) { const control = field(name); const safeValue = String(value || ""); if (control.tagName === "SELECT" && safeValue && ![...control.options].some((option) => option.value === safeValue)) control.add(new Option(`القيمة الحالية: ${safeValue}`, safeValue)); control.value = safeValue; }

  function renderStats() {
    const s = overview.stats;
    const cards = [
      ["الفرق المسجلة", s.teams, "TEAM", "cyan"], ["إجمالي المشاركين", s.members, "MEMBER", "blue"], ["الجاهزية العامة", formatPercent(s.overallPercent), `${s.completedRequirements}/${s.totalRequirements}`, "green"], ["فرق مكتملة", s.completeTeams, "100% READY", "violet"]
    ];
    els.stats.innerHTML = cards.map(([label, value, small, color]) => `<article class="stat-card ${color}"><span>${label}</span><b>${value}</b><small>${small}</small></article>`).join("");
    els.overallPercent.textContent = formatPercent(s.overallPercent);
    requestAnimationFrame(() => { els.overallBar.style.width = `${s.overallPercent}%`; });
    const types = [["رسوم العضوية", s.membershipComplete, s.members], ["الدفع الجماعي", s.groupPaymentComplete, s.members], ["عدم الممانعة", s.consentComplete, s.members]];
    els.breakdown.innerHTML = types.map(([label, done, total]) => `<div><span>${label}</span><b>${done}/${total}</b><i><em style="width:${total ? Math.round(done / total * 100) : 0}%"></em></i></div>`).join("");
    const attention = [...overview.teams].filter((t) => t.percent < 100).sort((a, b) => a.percent - b.percent).slice(0, 4);
    els.attention.innerHTML = attention.length ? attention.map((t) => `<button type="button" data-jump-team="${esc(t.teamNumber)}"><span><b>${esc(t.teamName)}</b><small>TEAM ${esc(t.teamNumber)}</small></span><strong>${formatPercent(t.percent)}</strong></button>`).join("") : '<div class="empty-mini">جميع الفرق مكتملة 🎉</div>';
  }

  function memberRow(member, memberIndex, teamIndex) {
    return `<div class="member-row"><div class="member-person"><span class="avatar">${esc(initials(member.fullNameArabic || member.fullNameEnglish))}</span><div><b>${esc(member.fullNameArabic || member.fullNameEnglish || "عضو بدون اسم")}</b><small>${esc(member.fullNameEnglish || member.email || "—")}</small></div></div><div class="member-progress"><div><span>الإنجاز ${member.completedRequirements || 0}/${member.totalRequirements || 3}</span><b>${formatPercent(member.percent)}</b></div><i><em style="width:${member.percent}%"></em></i></div><div class="member-statuses">${statusBadge(member.membershipComplete, "العضوية", "العضوية")}${statusBadge(member.groupPaymentComplete, "الدفع", "الدفع")}${statusBadge(member.consentComplete, "الممانعة", "الممانعة")}</div><div class="member-meta"><span>${esc(member.shirtSize || "—")} <small>مقاس</small></span><span>${esc(member.gender || "—")}</span></div><button class="edit-button" type="button" data-edit-member="${teamIndex}:${memberIndex}">تعديل كامل</button></div>`;
  }

  function teamCard(team, teamIndex) {
    return `<article class="team-card" id="team-${esc(team.teamNumber)}"><header><div class="team-identity"><span class="team-icon">${esc(team.teamNumber)}</span><div><p>TEAM ${esc(team.teamNumber)}</p><h2>${esc(team.teamName)}</h2><small>${team.members.length} أعضاء · ${team.completedRequirements}/${team.totalRequirements} متطلبات</small></div></div><div class="team-score ${percentClass(team.percent)}"><span>نسبة الإنجاز الدقيقة</span><b>${formatPercent(team.percent)}</b><i><em style="width:${team.percent}%"></em></i></div><div class="team-action-group"><button class="add-member-button" type="button" data-add-member="${teamIndex}">+ إضافة عضو</button><button class="team-settings" type="button" data-edit-team="${teamIndex}">إعدادات الفريق</button></div><button class="expand-button" type="button" data-toggle-team="${teamIndex}" aria-expanded="${teamIndex < 2}">${teamIndex < 2 ? "إخفاء" : "عرض الأعضاء"}</button></header><div class="team-members ${teamIndex < 2 ? "" : "collapsed"}">${team.members.map((m, i) => memberRow(m, i, teamIndex)).join("")}</div></article>`;
  }

  function renderTeams() {
    const query = normalized(els.search.value);
    const filter = els.filter.value;
    const filtered = overview.teams.filter((team) => {
      const searchable = normalized([team.teamNumber, team.teamName, ...team.members.flatMap((m) => [m.fullNameArabic, m.fullNameEnglish, m.email])].join(" "));
      const statusMatch = filter === "all" || (filter === "complete" && team.percent === 100) || (filter === "pending" && team.percent < 100) || (filter === "low" && team.percent < 50);
      return searchable.includes(query) && statusMatch;
    });
    els.results.textContent = `${filtered.length} من ${overview.teams.length} فريق`;
    els.teams.innerHTML = filtered.length ? filtered.map((t) => teamCard(t, overview.teams.indexOf(t))).join("") : '<div class="empty-state"><b>لا توجد نتائج مطابقة</b><span>جرّب تغيير البحث أو التصفية.</span></div>';
  }

  function allMembers() {
    return overview.teams.flatMap((team) => team.members.map((member) => ({ ...member, teamNumber: team.teamNumber, teamName: team.teamName })));
  }

  function matchesAudience(member, audience) {
    if (audience === "low") return member.percent < 50;
    if (audience === "consent") return !member.consentComplete;
    if (audience === "membership") return !member.membershipComplete;
    if (audience === "groupPayment") return !member.groupPaymentComplete;
    if (audience === "shirtSize") return !String(member.shirtSize || "").trim();
    return missingRequirements(member).length > 0;
  }

  function updateRecipientSummary() {
    els.selectedRecipientCount.textContent = selectedRecipients.size;
    const selectable = mailCandidates.filter((member) => validEmail(member.email));
    els.toggleAllRecipients.textContent = selectable.length && selectedRecipients.size === selectable.length ? "إلغاء تحديد الكل" : "تحديد الكل";
  }

  function renderMailCandidates(selectAll = false) {
    mailCandidates = allMembers().filter((member) => matchesAudience(member, els.mailAudience.value));
    if (selectAll) selectedRecipients = new Set(mailCandidates.filter((member) => validEmail(member.email)).map((member) => member.rowNumber));
    else selectedRecipients = new Set([...selectedRecipients].filter((rowNumber) => mailCandidates.some((member) => member.rowNumber === rowNumber && validEmail(member.email))));
    const missingEmails = mailCandidates.filter((member) => !validEmail(member.email)).length;
    els.missingEmailNote.textContent = missingEmails ? `${missingEmails} من المطابقين لا يملكون بريدًا إلكترونيًا صحيحًا ولن يتم إرسال رسالة لهم.` : "";
    els.recipientList.innerHTML = mailCandidates.length ? mailCandidates.map((member) => {
      const canSend = validEmail(member.email);
      const checked = selectedRecipients.has(member.rowNumber);
      const name = member.fullNameArabic || member.fullNameEnglish || "عضو بدون اسم";
      return `<label class="recipient-row ${canSend ? "" : "no-email"}"><input type="checkbox" data-recipient-row="${member.rowNumber}" ${checked ? "checked" : ""} ${canSend ? "" : "disabled"} /><span><b>${esc(name)}</b><small>TEAM ${esc(member.teamNumber)} · ${esc(member.email || "لا يوجد بريد")}</small></span><span>${esc(missingRequirements(member).join(" · ") || "مكتمل")}</span></label>`;
    }).join("") : '<div class="recipient-empty">لا يوجد أشخاص مطابقون لهذه الفئة.</div>';
    updateRecipientSummary();
  }

  function openMailCenter() {
    els.mailError.textContent = "";
    renderMailCandidates(true);
    els.mailDialog.showModal();
  }

  function render() { renderStats(); renderTeams(); els.lastUpdated.textContent = `آخر تحديث ${new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`; }
  async function loadOverview() { const data = await api("adminOverview"); overview = data; render(); }
  function openMemberDialog(team, member = null) {
    editingTeam = team;
    editingMember = member;
    memberMode = member ? "edit" : "create";
    els.memberTitle.textContent = member ? "تعديل جميع بيانات العضو" : "إضافة عضو جديد";
    els.memberSubtitle.textContent = member ? `${member.fullNameArabic || member.fullNameEnglish} — TEAM ${team.teamNumber}` : `عضو جديد ضمن ${team.teamName} — TEAM ${team.teamNumber}`;
    memberFields.forEach((name) => setFieldValue(name, member ? member[name] : ""));
    els.deleteMember.classList.toggle("hidden", !member);
    els.memberError.textContent = "";
    els.memberDialog.showModal();
  }

  els.loginForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = els.loginForm.querySelector('[type="submit"]'); els.loginError.textContent = ""; adminPassword = els.password.value; loading(button, true, "جاري التحقق..."); try { await loadOverview(); els.loginView.classList.add("hidden"); els.dashboard.classList.remove("hidden"); els.logout.classList.remove("hidden"); els.refresh.classList.remove("hidden"); els.lastUpdated.classList.remove("hidden"); } catch (error) { adminPassword = ""; els.loginError.textContent = error.message; } finally { loading(button, false, ""); } });
  $("#togglePassword").addEventListener("click", () => { els.password.type = els.password.type === "password" ? "text" : "password"; });
  els.logout.addEventListener("click", () => { adminPassword = ""; overview = { teams: [], stats: {} }; els.password.value = ""; els.dashboard.classList.add("hidden"); [els.logout, els.refresh, els.lastUpdated].forEach((el) => el.classList.add("hidden")); els.loginView.classList.remove("hidden"); });
  els.refresh.addEventListener("click", async () => { loading(els.refresh, true, "جاري التحديث..."); try { await loadOverview(); showToast("تم تحديث البيانات."); } catch (error) { showToast(error.message, true); } finally { loading(els.refresh, false, ""); } });
  els.search.addEventListener("input", renderTeams); els.filter.addEventListener("change", renderTeams);
  $("#openMailCenter").addEventListener("click", openMailCenter);
  els.mailAudience.addEventListener("change", () => renderMailCandidates(true));
  els.recipientList.addEventListener("change", (event) => { const checkbox = event.target.closest("[data-recipient-row]"); if (!checkbox) return; const rowNumber = Number(checkbox.dataset.recipientRow); if (checkbox.checked) selectedRecipients.add(rowNumber); else selectedRecipients.delete(rowNumber); updateRecipientSummary(); });
  els.toggleAllRecipients.addEventListener("click", () => { const selectable = mailCandidates.filter((member) => validEmail(member.email)); const allSelected = selectable.length && selectedRecipients.size === selectable.length; selectedRecipients = allSelected ? new Set() : new Set(selectable.map((member) => member.rowNumber)); renderMailCandidates(false); });
  els.attention.addEventListener("click", (e) => { const button = e.target.closest("[data-jump-team]"); if (!button) return; els.search.value = button.dataset.jumpTeam; renderTeams(); document.querySelector(".teams-list").scrollIntoView({ behavior: "smooth" }); });
  els.teams.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-team]"); if (toggle) { const body = toggle.closest(".team-card").querySelector(".team-members"); body.classList.toggle("collapsed"); toggle.textContent = body.classList.contains("collapsed") ? "عرض الأعضاء" : "إخفاء"; toggle.setAttribute("aria-expanded", !body.classList.contains("collapsed")); return; }
    const memberButton = event.target.closest("[data-edit-member]"); if (memberButton) { const [ti, mi] = memberButton.dataset.editMember.split(":").map(Number); openMemberDialog(overview.teams[ti], overview.teams[ti].members[mi]); return; }
    const addMemberButton = event.target.closest("[data-add-member]"); if (addMemberButton) { openMemberDialog(overview.teams[Number(addMemberButton.dataset.addMember)]); return; }
    const teamButton = event.target.closest("[data-edit-team]"); if (teamButton) { editingTeam = overview.teams[Number(teamButton.dataset.editTeam)]; els.teamSubtitle.textContent = `TEAM ${editingTeam.teamNumber} — ${editingTeam.members.length} أعضاء`; els.teamForm.elements.teamName.value = editingTeam.teamName || ""; els.teamForm.elements.newTeamNumber.value = editingTeam.teamNumber; els.teamForm.elements.teamPassword.value = editingTeam.password || ""; els.teamError.textContent = ""; els.teamDialog.showModal(); }
  });
  document.addEventListener("click", (e) => { const close = e.target.closest("[data-close]"); if (close) document.getElementById(close.dataset.close).close(); });
  els.memberForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#saveMemberButton"); const updates = Object.fromEntries(memberFields.map((name) => [name, field(name).value.trim()])); els.memberError.textContent = ""; loading(button, true, "جاري الحفظ..."); try { if (memberMode === "create") await api("adminCreateMember", { teamNumber: editingTeam.teamNumber, member: updates }); else await api("adminUpdateMember", { rowNumber: editingMember.rowNumber, updates }); els.memberDialog.close(); await loadOverview(); showToast(memberMode === "create" ? "تمت إضافة العضو بنجاح." : "تم حفظ جميع بيانات العضو."); } catch (error) { els.memberError.textContent = error.message; } finally { loading(button, false, ""); } });
  els.deleteMember.addEventListener("click", async () => { if (!editingMember) return; const name = editingMember.fullNameArabic || editingMember.fullNameEnglish; const confirmation = window.prompt(`هذا الحذف نهائي وسيزيل صف العضو من الشيت.\nللتأكيد اكتب اسم العضو كما هو:\n${name}`); if (confirmation === null) return; if (confirmation.trim() !== name) { els.memberError.textContent = "الاسم المكتوب لا يطابق اسم العضو، لم يتم الحذف."; return; } loading(els.deleteMember, true, "جاري الحذف..."); try { await api("adminDeleteMember", { rowNumber: editingMember.rowNumber, confirmationName: confirmation.trim() }); els.memberDialog.close(); await loadOverview(); showToast("تم حذف العضو من الشيت."); } catch (error) { els.memberError.textContent = error.message; } finally { loading(els.deleteMember, false, ""); } });
  els.teamForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#saveTeamButton"); const updates = { teamName: els.teamForm.elements.teamName.value.trim(), teamNumber: els.teamForm.elements.newTeamNumber.value.trim(), password: els.teamForm.elements.teamPassword.value.trim() }; els.teamError.textContent = ""; loading(button, true, "جاري الحفظ..."); try { await api("adminUpdateTeam", { currentTeamNumber: editingTeam.teamNumber, updates }); els.teamDialog.close(); await loadOverview(); showToast("تم تحديث إعدادات الفريق."); } catch (error) { els.teamError.textContent = error.message; } finally { loading(button, false, ""); } });
  els.mailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rowNumbers = [...selectedRecipients];
    const subject = els.mailSubject.value.trim();
    els.mailError.textContent = "";
    if (!rowNumbers.length) { els.mailError.textContent = "اختر شخصًا واحدًا على الأقل."; return; }
    if (!subject) { els.mailError.textContent = "اكتب موضوع الرسالة."; return; }
    const confirmed = window.confirm(`سيتم الآن إرسال ${rowNumbers.length} رسالة بريد إلكتروني فعلية للأشخاص المحددين.\n\nهل تريد المتابعة؟`);
    if (!confirmed) return;
    const button = $("#sendMailButton");
    loading(button, true, `جاري إرسال 0 من ${rowNumbers.length}...`);
    let sent = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < rowNumbers.length; i += 10) {
        const chunk = rowNumbers.slice(i, i + 10);
        const result = await api("adminSendReminders", { rowNumbers: chunk, subject, deadline: els.mailDeadline.value, extraMessage: els.mailExtraMessage.value.trim() });
        sent += Number(result.sent || 0);
        skipped += Number(result.skipped || 0);
        loading(button, true, `جاري إرسال ${Math.min(i + chunk.length, rowNumbers.length)} من ${rowNumbers.length}...`);
      }
      els.mailDialog.close();
      showToast(`تم إرسال ${sent} رسالة بنجاح${skipped ? `، وتجاوز ${skipped}` : ""}.`);
    } catch (error) { els.mailError.textContent = `${error.message}${sent ? ` (تم إرسال ${sent} رسالة قبل توقف العملية.)` : ""}`; }
    finally { loading(button, false, ""); }
  });
})();
