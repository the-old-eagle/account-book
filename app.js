// ===== 记账本前端应用 =====
// 说明：纯前端实现，数据存于 localStorage；登录为前端模拟（非真正鉴权），仅用于角色区分。
// 数据模型：localStorage['account_book_records'] = [{id,date,type,category,amount,note}, ...]
(function () {
  'use strict';

  var STORAGE_KEY = 'account_book_records';
  var SESSION_KEY = 'account_book_user';
  var SEED_PATH = 'data/account-book.xlsx';

  // ---------- 工具函数 ----------
  function genId() {
    if (window.crypto && crypto.randomUUID) return 'r-' + crypto.randomUUID();
    return 'r-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  }

  function loadRecords() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function currentUser() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtMoney(n, type) {
    var v = Number(n) || 0;
    var s = '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var cls = type === '收入' ? 'pos' : 'neg';
    return '<span class="' + cls + '">' + s + '</span>';
  }

  // ---------- 字段映射（兼容中英文表头） ----------
  function mapRow(row) {
    var date = row['日期'] != null ? row['日期'] : row['date'];
    var type = row['类型'] != null ? row['类型'] : row['type'];
    var category = row['分类'] != null ? row['分类'] : row['category'];
    var amount = row['金额'] != null ? row['金额'] : row['amount'];
    var note = row['备注'] != null ? row['备注'] : (row['note'] != null ? row['note'] : '');

    // 归一化日期为 yyyy-mm-dd 字符串
    if (date instanceof Date) {
      var mm = String(date.getMonth() + 1).padStart(2, '0');
      var dd = String(date.getDate()).padStart(2, '0');
      date = date.getFullYear() + '-' + mm + '-' + dd;
    } else {
      date = String(date || '').trim();
    }

    // 归一化类型
    var t = String(type || '').trim();
    type = (t === '收入' || /^income$/i.test(t)) ? '收入' : '支出';

    // 金额转数字
    amount = Number(amount);
    if (isNaN(amount)) amount = 0;

    return {
      id: genId(),
      date: date,
      type: type,
      category: String(category || '').trim(),
      amount: amount,
      note: String(note || '').trim()
    };
  }

  function rowsToRecords(rows) {
    return rows.map(mapRow).filter(function (r) { return r.date; });
  }

  // ---------- 种子数据载入 ----------
  async function ensureSeed() {
    if (loadRecords().length > 0) return;
    try {
      var resp = await fetch(SEED_PATH);
      if (!resp.ok) { console.warn('种子数据加载失败:', resp.status); return; }
      var buf = await resp.arrayBuffer();
      var wb = XLSX.read(buf, { type: 'array' });
      var sheet = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      var recs = rowsToRecords(rows);
      if (recs.length) saveRecords(recs);
    } catch (e) {
      console.warn('种子数据载入异常:', e);
    }
  }

  // ---------- 登录 / 登出 ----------
  function login(username, password) {
    var users = (window.AUTH_CONFIG && AUTH_CONFIG.users) || [];
    var u = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].username === username && users[i].password === password) { u = users[i]; break; }
    }
    if (!u) return false;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      username: u.username, role: u.role, label: u.label || u.role
    }));
    return true;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  }

  // ---------- 视图切换 ----------
  function showLogin() {
    document.getElementById('loginView').style.display = '';
    document.getElementById('mainView').style.display = 'none';
  }

  async function showMain() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('mainView').style.display = '';
    var u = currentUser();
    document.getElementById('currentUser').textContent = u.username;
    document.getElementById('currentRole').textContent = u.label || u.role;
    var isAdmin = u.role === 'admin';
    var adminNodes = document.querySelectorAll('.admin-only');
    for (var i = 0; i < adminNodes.length; i++) {
      adminNodes[i].style.display = isAdmin ? '' : 'none';
    }
    await ensureSeed();
    renderAll();
  }

  // ---------- 渲染 ----------
  var chartInstances = {};

  function getFiltered() {
    var records = loadRecords();
    var fType = document.getElementById('filterType').value;
    var fCat = document.getElementById('filterCategory').value;
    return records.filter(function (r) {
      if (fType && r.type !== fType) return false;
      if (fCat && r.category !== fCat) return false;
      return true;
    });
  }

  function refreshCategoryFilter() {
    var records = loadRecords();
    var cats = {};
    records.forEach(function (r) { if (r.category) cats[r.category] = 1; });
    var sel = document.getElementById('filterCategory');
    var cur = sel.value;
    sel.innerHTML = '<option value="">全部分类</option>';
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (c === cur) o.selected = true;
      sel.appendChild(o);
    });
  }

  function renderTable() {
    var list = getFiltered();
    var isAdmin = currentUser().role === 'admin';
    var tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '';
    if (list.length === 0) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="' + (isAdmin ? 6 : 5) + '" class="empty">暂无记录</td>';
      tbody.appendChild(tr);
      return;
    }
    // 按日期倒序展示
    list.slice().sort(function (a, b) { return (a.date < b.date) ? 1 : (a.date > b.date ? -1 : 0); })
      .forEach(function (r) {
        var tr = document.createElement('tr');
        tr.className = r.type === '收入' ? 'row-income' : 'row-expense';
        var html =
          '<td>' + esc(r.date) + '</td>' +
          '<td><span class="tag ' + (r.type === '收入' ? 'tag-in' : 'tag-out') + '">' + esc(r.type) + '</span></td>' +
          '<td>' + esc(r.category) + '</td>' +
          '<td class="amt">' + fmtMoney(r.amount, r.type) + '</td>' +
          '<td>' + esc(r.note) + '</td>';
        if (isAdmin) {
          html += '<td class="ops">' +
            '<button class="btn btn-link btn-edit" data-id="' + esc(r.id) + '">编辑</button>' +
            '<button class="btn btn-link btn-del" data-id="' + esc(r.id) + '">删除</button>' +
            '</td>';
        }
        tr.innerHTML = html;
        tbody.appendChild(tr);
      });
  }

  function renderSummary() {
    var list = getFiltered();
    var income = 0, expense = 0;
    var byCat = {};
    list.forEach(function (r) {
      byCat[r.type] = byCat[r.type] || {};
      byCat[r.type][r.category] = (byCat[r.type][r.category] || 0) + r.amount;
      if (r.type === '收入') income += r.amount; else expense += r.amount;
    });
    var balance = income - expense;
    document.getElementById('sumIncome').innerHTML = fmtMoney(income, '收入');
    document.getElementById('sumExpense').innerHTML = fmtMoney(expense, '支出');
    document.getElementById('sumBalance').innerHTML = fmtMoney(Math.abs(balance), balance >= 0 ? '收入' : '支出');

    var box = document.getElementById('catSubtotals');
    var html = '';
    ['收入', '支出'].forEach(function (t) {
      var cats = byCat[t] || {};
      var keys = Object.keys(cats);
      if (!keys.length) return;
      html += '<div class="sub-group"><h4 class="' + (t === '收入' ? 'pos' : 'neg') + '">' + t + '</h4><ul>';
      keys.sort().forEach(function (k) {
        html += '<li><span class="sub-name">' + esc(k) + '</span>' +
          '<span class="' + (t === '收入' ? 'pos' : 'neg') + '">' + fmtMoney(cats[k], t) + '</span></li>';
      });
      html += '</ul></div>';
    });
    box.innerHTML = html || '<p class="empty">暂无数据</p>';
  }

  function palette(n) {
    var c = ['#2F5596', '#1A7F37', '#C92A2A', '#E0A800', '#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6', '#F97316', '#64748B'];
    var out = [];
    for (var i = 0; i < n; i++) out.push(c[i % c.length]);
    return out;
  }

  function destroyCharts() {
    Object.keys(chartInstances).forEach(function (k) {
      if (chartInstances[k]) { chartInstances[k].destroy(); delete chartInstances[k]; }
    });
  }

  function renderCharts() {
    var list = getFiltered();
    destroyCharts();

    // 支出分类占比（饼图）
    var expenseByCat = {};
    list.forEach(function (r) {
      if (r.type === '支出') expenseByCat[r.category] = (expenseByCat[r.category] || 0) + r.amount;
    });
    var pieCtx = document.getElementById('chartPie');
    if (pieCtx && typeof Chart !== 'undefined') {
      chartInstances.pie = new Chart(pieCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: Object.keys(expenseByCat),
          datasets: [{ data: Object.values(expenseByCat), backgroundColor: palette(Object.keys(expenseByCat).length) }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'right' }, title: { display: false } }
        }
      });
    }

    // 月度收支趋势（折线图）
    var monthData = {};
    list.forEach(function (r) {
      var m = (r.date || '').slice(0, 7);
      if (!m) return;
      monthData[m] = monthData[m] || { '收入': 0, '支出': 0 };
      monthData[m][r.type] += r.amount;
    });
    var months = Object.keys(monthData).sort();
    var lineCtx = document.getElementById('chartLine');
    if (lineCtx && typeof Chart !== 'undefined') {
      chartInstances.line = new Chart(lineCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: months,
          datasets: [
            { label: '收入', data: months.map(function (m) { return monthData[m]['收入']; }), borderColor: '#1A7F37', backgroundColor: 'rgba(26,127,55,.15)', tension: 0.3, fill: true },
            { label: '支出', data: months.map(function (m) { return monthData[m]['支出']; }), borderColor: '#C92A2A', backgroundColor: 'rgba(201,42,42,.15)', tension: 0.3, fill: true }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  }

  function renderAll() {
    refreshCategoryFilter();
    renderTable();
    renderSummary();
    renderCharts();
  }

  // ---------- CRUD（仅 admin） ----------
  function addRecord(rec) {
    var records = loadRecords();
    rec.id = genId();
    records.push(rec);
    saveRecords(records);
    renderAll();
  }

  function updateRecord(rec) {
    var records = loadRecords();
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === rec.id) { records[i] = rec; break; }
    }
    saveRecords(records);
    renderAll();
  }

  function deleteRecord(id) {
    var records = loadRecords().filter(function (r) { return r.id !== id; });
    saveRecords(records);
    renderAll();
  }

  function getRecord(id) {
    var records = loadRecords();
    for (var i = 0; i < records.length; i++) { if (records[i].id === id) return records[i]; }
    return null;
  }

  // ---------- Excel 导入 ----------
  function handleImport(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        var recs = rowsToRecords(rows);
        if (!recs.length) { alert('未解析到有效记录，请检查文件格式与表头（日期/类型/分类/金额/备注）。'); return; }
        var overwrite = confirm('共解析到 ' + recs.length + ' 条记录。\n点击「确定」覆盖现有数据，点击「取消」追加到现有数据。');
        var records = loadRecords();
        records = overwrite ? recs : records.concat(recs);
        saveRecords(records);
        alert('导入完成，当前共 ' + records.length + ' 条记录。');
        renderAll();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- 表单 ----------
  var editingId = null;

  function readForm() {
    var rec = {
      date: document.getElementById('fDate').value,
      type: document.getElementById('fType').value,
      category: document.getElementById('fCategory').value.trim(),
      amount: parseFloat(document.getElementById('fAmount').value),
      note: document.getElementById('fNote').value.trim()
    };
    if (!rec.date) { alert('请选择日期'); return null; }
    if (!rec.category) { alert('请输入分类'); return null; }
    if (isNaN(rec.amount)) { alert('请输入有效金额'); return null; }
    return rec;
  }

  function resetForm() {
    document.getElementById('recordForm').reset();
    document.getElementById('fId').value = '';
    document.getElementById('formSubmit').textContent = '新增记录';
    editingId = null;
  }

  function fillForm(r) {
    editingId = r.id;
    document.getElementById('fId').value = r.id;
    document.getElementById('fDate').value = r.date;
    document.getElementById('fType').value = r.type;
    document.getElementById('fCategory').value = r.category;
    document.getElementById('fAmount').value = r.amount;
    document.getElementById('fNote').value = r.note;
    document.getElementById('formSubmit').textContent = '更新记录';
  }

  // ---------- 初始化 ----------
  function init() {
    // 登录
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = document.getElementById('loginUser').value.trim();
      var p = document.getElementById('loginPass').value;
      if (login(u, p)) {
        document.getElementById('loginError').textContent = '';
        showMain();
      } else {
        document.getElementById('loginError').textContent = '用户名或密码错误';
      }
    });

    // 登出
    document.getElementById('btnLogout').addEventListener('click', logout);

    // 导入
    document.getElementById('importFile').addEventListener('change', function () {
      if (this.files && this.files[0]) handleImport(this.files[0]);
      this.value = '';
    });

    // 筛选
    function onFilter() { renderTable(); renderSummary(); renderCharts(); }
    document.getElementById('filterType').addEventListener('change', onFilter);
    document.getElementById('filterCategory').addEventListener('change', onFilter);

    // 表单提交（新增 / 更新）
    document.getElementById('recordForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var rec = readForm();
      if (!rec) return;
      if (editingId) { rec.id = editingId; updateRecord(rec); } else { addRecord(rec); }
      resetForm();
    });
    document.getElementById('formCancel').addEventListener('click', resetForm);

    // 表格事件委托（编辑 / 删除）
    document.getElementById('recordsBody').addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('btn-del')) {
        var id = t.getAttribute('data-id');
        if (confirm('确定删除该记录？')) deleteRecord(id);
      } else if (t.classList.contains('btn-edit')) {
        var r = getRecord(t.getAttribute('data-id'));
        if (r) {
          fillForm(r);
          document.getElementById('adminArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });

    // 进入视图
    if (currentUser()) showMain(); else showLogin();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
