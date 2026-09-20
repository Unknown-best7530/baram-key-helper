const state = { licenses: [] };
const $ = (selector) => document.querySelector(selector);

function show_notice(message, type = "success") {
  const notice = $("#notice");
  notice.textContent = message;
  notice.className = `notice ${type}`;
  clearTimeout(show_notice.timer);
  show_notice.timer = setTimeout(() => notice.classList.add("hidden"), 5000);
}

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({ error: "invalid_server_response" }));
  if (!response.ok || body.ok === false) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

function text(value) { return value === null || value === undefined || value === "" ? "-" : String(value); }
function escape_html(value) {
  return text(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function render_stats() {
  const now = Date.now();
  const seven_days = now + 7 * 86400000;
  $("#stat-total").textContent = state.licenses.length;
  $("#stat-active").textContent = state.licenses.filter((item) => item.status === "active").length;
  $("#stat-blocked").textContent = state.licenses.filter((item) => item.status === "blocked").length;
  $("#stat-trial").textContent = state.licenses.filter((item) => Number(item.is_trial) === 1).length;
  $("#stat-expiring").textContent = state.licenses.filter((item) => {
    const expiry = Date.parse(item.expires_at);
    return Number(item.is_permanent) !== 1 && expiry >= now && expiry <= seven_days;
  }).length;
}

function render_rows() {
  const rows = $("#license-rows");
  if (!state.licenses.length) {
    rows.innerHTML = '<tr><td colspan="9" class="empty">조건에 맞는 라이선스가 없습니다.</td></tr>';
    return;
  }
  rows.innerHTML = state.licenses.map((item) => {
    const trial = Number(item.is_trial) === 1;
    const permanent = Number(item.is_permanent) === 1;
    return `<tr data-id="${item.id}">
      <td class="nowrap">${item.id}</td><td>${escape_html(item.customer_label)}</td>
      <td><span class="badge ${item.status}">${item.status === "active" ? "활성" : "차단"}</span>${trial ? ' <span class="badge trial">체험</span>' : ""}</td>
      <td>${escape_html(item.plan)}</td><td class="nowrap">${permanent ? "영구" : escape_html(item.expires_at)}</td>
      <td class="nowrap">${item.device_count}/${item.max_devices}</td><td>${escape_html(item.email)}</td><td class="note-cell">${escape_html(item.note)}</td>
      <td><details class="row-actions"><summary>관리</summary><div class="action-menu">
        <button class="button secondary" data-action="edit">정보 수정</button><button class="button secondary" data-action="extend" ${permanent ? "disabled" : ""}>기간 연장</button>
        ${trial ? '<button class="button primary" data-action="convert">유료 전환</button>' : ""}
        <button class="button ${item.status === "active" ? "warning" : "secondary"}" data-action="status">${item.status === "active" ? "라이선스 차단" : "차단 해제"}</button>
        <button class="button warning" data-action="block-devices">PC 함께 차단</button><button class="button secondary" data-action="unblock-devices">PC 차단 해제</button>
        <button class="button secondary" data-action="reset-devices">PC 등록 초기화</button><button class="button danger" data-action="delete">영구 삭제</button>
      </div></details></td></tr>`;
  }).join("");
}

async function load_licenses() {
  const query = new URLSearchParams();
  for (const [key, value] of new FormData($("#filter-form")).entries()) if (String(value).trim()) query.set(key, String(value).trim());
  $("#license-rows").innerHTML = '<tr><td colspan="9" class="empty">라이선스를 불러오는 중입니다.</td></tr>';
  try {
    const body = await api(`licenses?${query}`);
    state.licenses = body.licenses || [];
    render_stats(); render_rows();
    $("#last-updated").textContent = `마지막 갱신 ${new Date().toLocaleTimeString("ko-KR")}`;
  } catch (error) {
    $("#license-rows").innerHTML = `<tr><td colspan="9" class="empty">${escape_html(error.message)}</td></tr>`;
    show_notice(`목록을 불러오지 못했습니다: ${error.message}`, "error");
  }
}

function open_create() {
  $("#license-form").reset(); $("#license-id").value = ""; $("#days").value = "30"; $("#max-devices").value = "1";
  $("#is-permanent").disabled = false; $("#dialog-heading").textContent = "라이선스 발급"; $("#save-license").textContent = "발급";
  $("#days-field").classList.remove("hidden"); $("#license-dialog").showModal();
}

function open_edit(item) {
  $("#license-form").reset(); $("#license-id").value = item.id; $("#customer-label").value = item.customer_label || "";
  $("#email").value = item.email || ""; $("#plan").value = item.plan; $("#max-devices").value = item.max_devices; $("#note").value = item.note || "";
  $("#is-permanent").checked = Number(item.is_permanent) === 1; $("#is-permanent").disabled = true;
  $("#dialog-heading").textContent = `#${item.id} 라이선스 수정`; $("#save-license").textContent = "저장";
  $("#days-field").classList.add("hidden"); $("#license-dialog").showModal();
}

async function save_license(event) {
  event.preventDefault();
  const id = $("#license-id").value;
  const payload = { customer_label: $("#customer-label").value, email: $("#email").value, plan: $("#plan").value,
    max_devices: Number($("#max-devices").value), note: $("#note").value };
  if (!id) {
    payload.is_permanent = $("#is-permanent").checked;
    if (!payload.is_permanent) payload.days = Number($("#days").value);
  }
  try {
    const result = await api(id ? `licenses/${id}` : "licenses", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
    $("#license-dialog").close(); show_notice(result.message || "저장했습니다."); await load_licenses();
    if (result.license_key) { $("#created-key").textContent = result.license_key; $("#key-dialog").showModal(); }
  } catch (error) { show_notice(`저장하지 못했습니다: ${error.message}`, "error"); }
}

async function run_action(item, action) {
  try {
    let result;
    if (action === "edit") return open_edit(item);
    if (action === "extend") {
      const days = prompt("연장할 일수(1~365)", "30"); if (days === null) return;
      result = await api(`licenses/${item.id}/extend`, { method: "POST", body: JSON.stringify({ days: Number(days) }) });
    } else if (action === "convert") {
      const days = prompt("구매한 이용 일수(1~365)", "30"); if (days === null) return;
      const plan = prompt("플랜: basic / standard / pro", item.plan || "pro"); if (plan === null) return;
      result = await api(`licenses/${item.id}/convert-trial`, { method: "POST", body: JSON.stringify({ days: Number(days), plan, max_devices: item.max_devices }) });
    } else if (action === "status") {
      const status = item.status === "active" ? "blocked" : "active";
      if (!confirm(`라이선스를 ${status === "blocked" ? "차단" : "활성화"}할까요?`)) return;
      result = await api(`licenses/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    } else if (action === "block-devices") {
      const reason = prompt("PC 차단 사유", "관리자 차단"); if (reason === null || !confirm("등록된 PC와 라이선스를 함께 차단할까요?")) return;
      result = await api(`licenses/${item.id}/block-devices`, { method: "POST", body: JSON.stringify({ reason }) });
    } else if (action === "unblock-devices") {
      if (!confirm("등록된 PC와 라이선스 차단을 함께 해제할까요?")) return;
      result = await api(`licenses/${item.id}/unblock-devices`, { method: "POST", body: "{}" });
    } else if (action === "reset-devices") {
      if (!confirm("등록된 PC 연결을 모두 초기화할까요? 사용자가 다시 활성화해야 합니다.")) return;
      result = await api(`licenses/${item.id}/reset-devices`, { method: "POST", body: "{}" });
    } else if (action === "delete") {
      if (!confirm(`#${item.id} 라이선스를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
      result = await api(`licenses/${item.id}`, { method: "DELETE", body: "{}" });
    }
    show_notice(result?.message || "처리했습니다."); await load_licenses();
  } catch (error) { show_notice(`처리하지 못했습니다: ${error.message}`, "error"); }
}

$("#filter-form").addEventListener("submit", (event) => { event.preventDefault(); load_licenses(); });
$("#reset-filter").addEventListener("click", () => { $("#filter-form").reset(); load_licenses(); });
$("#refresh-button").addEventListener("click", load_licenses); $("#create-button").addEventListener("click", open_create);
$("#license-form").addEventListener("submit", save_license);
$("#is-permanent").addEventListener("change", () => $("#days-field").classList.toggle("hidden", $("#is-permanent").checked));
$("#copy-key").addEventListener("click", async () => { await navigator.clipboard.writeText($("#created-key").textContent); show_notice("라이선스 키를 복사했습니다."); });
$("#license-rows").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]"); if (!button || button.disabled) return;
  const item = state.licenses.find((license) => Number(license.id) === Number(button.closest("tr").dataset.id));
  if (item) run_action(item, button.dataset.action);
});

load_licenses();
