(function () {
  "use strict";
  const API_URL = (window.EXTREME_CONFIG || {}).API_URL || "/api/team";
  const $ = (selector) => document.querySelector(selector);
  const els = { loginView: $("#loginView"), dashboard: $("#dashboardView"), loginForm: $("#adminLoginForm"), password: $("#adminPassword"), loginError: $("#loginError"), logout: $("#logoutButton"), refresh: $("#refreshButton"), lastUpdated: $("#lastUpdated"), stats: $("#statsGrid"), overallPercent: $("#overallPercent"), overallBar: $("#overallBar"), breakdown: $("#requirementsBreakdown"), attention: $("#attentionList"), search: $("#searchInput"), filter: $("#statusFilter"), results: $("#resultsCount"), teams: $("#teamsList"), memberDialog: $("#memberDialog"), memberForm: $("#memberForm"), memberSubtitle: $("#memberDialogSubtitle"), memberError: $("#memberError"), teamDialog: $("#teamDialog"), teamForm: $("#teamForm"), teamSubtitle: $("#teamDialogSubtitle"), teamError: $("#teamError"), toast: $("#toast") };
  let adminPassword = "";
  let overview = { teams: [], stats: {} };
  let editingMember = null;
  let editingTeam = null;

  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const normalized = (value = "") => String(value).trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/[ًٌٍَُِّْـ]/g, "");
  const initials = (name) => String(name || "عضو").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
  const statusBadge = (done, yes = "مكتمل", no = "ناقص") => `<span class="status-badge ${done ? "done" : "pending"}"><i></i>${done ? yes : no}</span>`;
  const percentClass = (percent) => percent === 100 ? "complete" : percent < 50 ? "low" : "medium";

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
      ["الفرق المسجلة", s.teams, "TEAM", "cyan"], ["إجمالي المشاركين", s.members, "MEMBER", "blue"], ["الجاهزية العامة", `${s.overallPercent}%`, `${s.completedRequirements}/${s.totalRequirements}`, "green"], ["فرق مكتملة", s.completeTeams, "100% READY", "violet"]
    ];
    els.stats.innerHTML = cards.map(([label, value, small, color]) => `<article class="stat-card ${color}"><span>${label}</span><b>${value}</b><small>${small}</small></article>`).join("");
    els.overallPercent.textContent = `${s.overallPercent}%`;
    requestAnimationFrame(() => { els.overallBar.style.width = `${s.overallPercent}%`; });
    const types = [["رسوم العضوية", s.membershipComplete, s.members], ["الدفع الجماعي", s.groupPaymentComplete, s.members], ["عدم الممانعة", s.consentComplete, s.members]];
    els.breakdown.innerHTML = types.map(([label, done, total]) => `<div><span>${label}</span><b>${done}/${total}</b><i><em style="width:${total ? Math.round(done / total * 100) : 0}%"></em></i></div>`).join("");
    const attention = [...overview.teams].filter((t) => t.percent < 100).sort((a, b) => a.percent - b.percent).slice(0, 4);
    els.attention.innerHTML = attention.length ? attention.map((t) => `<button type="button" data-jump-team="${esc(t.teamNumber)}"><span><b>${esc(t.teamName)}</b><small>TEAM ${esc(t.teamNumber)}</small></span><strong>${t.percent}%</strong></button>`).join("") : '<div class="empty-mini">جميع الفرق مكتملة 🎉</div>';
  }

  function memberRow(member, memberIndex, teamIndex) {
    return `<div class="member-row"><div class="member-person"><span class="avatar">${esc(initials(member.fullNameArabic || member.fullNameEnglish))}</span><div><b>${esc(member.fullNameArabic || member.fullNameEnglish || "عضو بدون اسم")}</b><small>${esc(member.fullNameEnglish || member.email || "—")}</small></div></div><div class="member-progress"><div><span>الإنجاز</span><b>${member.percent}%</b></div><i><em style="width:${member.percent}%"></em></i></div><div class="member-statuses">${statusBadge(member.membershipComplete, "العضوية", "العضوية")}${statusBadge(member.groupPaymentComplete, "الدفع", "الدفع")}${statusBadge(member.consentComplete, "الممانعة", "الممانعة")}</div><div class="member-meta"><span>${esc(member.shirtSize || "—")} <small>مقاس</small></span><span>${esc(member.gender || "—")}</span></div><button class="edit-button" type="button" data-edit-member="${teamIndex}:${memberIndex}">تعديل</button></div>`;
  }

  function teamCard(team, teamIndex) {
    return `<article class="team-card" id="team-${esc(team.teamNumber)}"><header><div class="team-identity"><span class="team-icon">${esc(team.teamNumber)}</span><div><p>TEAM ${esc(team.teamNumber)}</p><h2>${esc(team.teamName)}</h2><small>${team.members.length} أعضاء</small></div></div><div class="team-score ${percentClass(team.percent)}"><span>نسبة الإنجاز</span><b>${team.percent}%</b><i><em style="width:${team.percent}%"></em></i></div><button class="team-settings" type="button" data-edit-team="${teamIndex}">إعدادات الفريق</button><button class="expand-button" type="button" data-toggle-team="${teamIndex}" aria-expanded="${teamIndex < 2}">${teamIndex < 2 ? "إخفاء" : "عرض الأعضاء"}</button></header><div class="team-members ${teamIndex < 2 ? "" : "collapsed"}">${team.members.map((m, i) => memberRow(m, i, teamIndex)).join("")}</div></article>`;
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

  function render() { renderStats(); renderTeams(); els.lastUpdated.textContent = `آخر تحديث ${new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`; }
  async function loadOverview() { const data = await api("adminOverview"); overview = data; render(); }

  els.loginForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = els.loginForm.querySelector('[type="submit"]'); els.loginError.textContent = ""; adminPassword = els.password.value; loading(button, true, "جاري التحقق..."); try { await loadOverview(); els.loginView.classList.add("hidden"); els.dashboard.classList.remove("hidden"); els.logout.classList.remove("hidden"); els.refresh.classList.remove("hidden"); els.lastUpdated.classList.remove("hidden"); } catch (error) { adminPassword = ""; els.loginError.textContent = error.message; } finally { loading(button, false, ""); } });
  $("#togglePassword").addEventListener("click", () => { els.password.type = els.password.type === "password" ? "text" : "password"; });
  els.logout.addEventListener("click", () => { adminPassword = ""; overview = { teams: [], stats: {} }; els.password.value = ""; els.dashboard.classList.add("hidden"); [els.logout, els.refresh, els.lastUpdated].forEach((el) => el.classList.add("hidden")); els.loginView.classList.remove("hidden"); });
  els.refresh.addEventListener("click", async () => { loading(els.refresh, true, "جاري التحديث..."); try { await loadOverview(); showToast("تم تحديث البيانات."); } catch (error) { showToast(error.message, true); } finally { loading(els.refresh, false, ""); } });
  els.search.addEventListener("input", renderTeams); els.filter.addEventListener("change", renderTeams);
  els.attention.addEventListener("click", (e) => { const button = e.target.closest("[data-jump-team]"); if (!button) return; els.search.value = button.dataset.jumpTeam; renderTeams(); document.querySelector(".teams-list").scrollIntoView({ behavior: "smooth" }); });
  els.teams.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-team]"); if (toggle) { const body = toggle.closest(".team-card").querySelector(".team-members"); body.classList.toggle("collapsed"); toggle.textContent = body.classList.contains("collapsed") ? "عرض الأعضاء" : "إخفاء"; toggle.setAttribute("aria-expanded", !body.classList.contains("collapsed")); return; }
    const memberButton = event.target.closest("[data-edit-member]"); if (memberButton) { const [ti, mi] = memberButton.dataset.editMember.split(":").map(Number); editingMember = overview.teams[ti].members[mi]; els.memberSubtitle.textContent = `${editingMember.fullNameArabic || editingMember.fullNameEnglish} — TEAM ${overview.teams[ti].teamNumber}`; ["fullNameArabic", "fullNameEnglish", "email", "mobile", "whatsapp", "gender", "shirtSize", "membershipPaymentStatus", "groupPaymentStatus", "consentStatus"].forEach((name) => setFieldValue(name, editingMember[name])); els.memberError.textContent = ""; els.memberDialog.showModal(); return; }
    const teamButton = event.target.closest("[data-edit-team]"); if (teamButton) { editingTeam = overview.teams[Number(teamButton.dataset.editTeam)]; els.teamSubtitle.textContent = `TEAM ${editingTeam.teamNumber} — ${editingTeam.members.length} أعضاء`; els.teamForm.elements.teamName.value = editingTeam.teamName || ""; els.teamForm.elements.newTeamNumber.value = editingTeam.teamNumber; els.teamForm.elements.teamPassword.value = editingTeam.password || ""; els.teamError.textContent = ""; els.teamDialog.showModal(); }
  });
  document.addEventListener("click", (e) => { const close = e.target.closest("[data-close]"); if (close) document.getElementById(close.dataset.close).close(); });
  els.memberForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#saveMemberButton"); const updates = Object.fromEntries(["fullNameArabic", "fullNameEnglish", "email", "mobile", "whatsapp", "gender", "shirtSize", "membershipPaymentStatus", "groupPaymentStatus", "consentStatus"].map((name) => [name, field(name).value.trim()])); els.memberError.textContent = ""; loading(button, true, "جاري الحفظ..."); try { await api("adminUpdateMember", { rowNumber: editingMember.rowNumber, updates }); els.memberDialog.close(); await loadOverview(); showToast("تم حفظ بيانات العضو بنجاح."); } catch (error) { els.memberError.textContent = error.message; } finally { loading(button, false, ""); } });
  els.teamForm.addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#saveTeamButton"); const updates = { teamName: els.teamForm.elements.teamName.value.trim(), teamNumber: els.teamForm.elements.newTeamNumber.value.trim(), password: els.teamForm.elements.teamPassword.value.trim() }; els.teamError.textContent = ""; loading(button, true, "جاري الحفظ..."); try { await api("adminUpdateTeam", { currentTeamNumber: editingTeam.teamNumber, updates }); els.teamDialog.close(); await loadOverview(); showToast("تم تحديث إعدادات الفريق."); } catch (error) { els.teamError.textContent = error.message; } finally { loading(button, false, ""); } });
})();
