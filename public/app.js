const $ = (id) => document.getElementById(id);

const PRESET_CATEGORIES = [
  { id: "preset_sueldo", name: "Sueldo", emoji: "💼", color: "#22c55e", type: "ingreso", preset: true },
  { id: "preset_super", name: "Supermercado", emoji: "🛒", color: "#f59e0b", type: "gasto", preset: true },
  { id: "preset_casa", name: "Hogar", emoji: "🏠", color: "#3b82f6", type: "gasto", preset: true },
  { id: "preset_salud", name: "Salud", emoji: "💊", color: "#ef4444", type: "gasto", preset: true },
  { id: "preset_estudio", name: "Educación", emoji: "📚", color: "#06b6d4", type: "gasto", preset: true }
];

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

let state = {
  transactions: [],
  categories: [],
  goals: [],
  savingGoal: 0,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear()
};

let txType = "ingreso";
let quickType = "ingreso";
let editingTxId = null;
let editingGoalId = null;

const pageMeta = {
  dashboard: ["Inicio", "Resumen mensual"],
  ingresos: ["Ingresos", "Tus ingresos del mes"],
  gastos: ["Gastos", "Tus gastos del mes"],
  categorias: ["Categorías", "Organización"],
  metas: ["Metas", "Tus objetivos"]
};

function saveState() {
  localStorage.setItem("finix_state_simple", JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem("finix_state_simple");
  if (saved) state = { ...state, ...JSON.parse(saved) };
}

function fmtNum(n) {
  return Math.round(Number(n || 0)).toLocaleString("es-AR");
}

function fmt(n) {
  return `$${fmtNum(n)}`;
}

function parseNumber(v) {
  return parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0;
}

function formatInputNumber(input) {
  input.addEventListener("input", () => {
    const value = parseNumber(input.value);
    input.value = value ? fmtNum(value) : "";
  });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function allCategories() {
  return [...PRESET_CATEGORIES, ...state.categories];
}

function getCategory(id) {
  return allCategories().find((c) => c.id === id) || null;
}

function currentTransactions() {
  return state.transactions.filter((t) => {
    const d = new Date(`${t.date}T00:00:00`);
    return d.getMonth() === state.currentMonth && d.getFullYear() === state.currentYear;
  });
}

function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function setMonthLabel() {
  $("currentMonth").textContent = `${MONTHS[state.currentMonth]} ${state.currentYear}`;
}

function navigate(section) {
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === section);
  });

  document.querySelectorAll(".section").forEach((s) => {
    s.classList.toggle("active", s.id === `section-${section}`);
  });

  $("pageTitle").textContent = pageMeta[section][0];
  $("pageSubtitle").textContent = pageMeta[section][1];
}

function updateCategorySelect(selectId, type) {
  const select = $(selectId);
  select.innerHTML = `<option value="">Sin categoría</option>`;

  allCategories()
    .filter((c) => c.type === "ambos" || c.type === type)
    .forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.emoji} ${c.name}`;
      select.appendChild(opt);
    });
}

function buildTransactionItem(t) {
  const cat = getCategory(t.categoryId);
  const amountClass = t.type === "ingreso" ? "income" : "expense";
  const sign = t.type === "ingreso" ? "+" : "-";
  const meta = [
    new Date(`${t.date}T00:00:00`).toLocaleDateString("es-AR"),
    cat ? `${cat.emoji} ${cat.name}` : "Sin categoría"
  ].join(" · ");

  return `
    <li>
      <div class="item-main">
        <strong>${t.description}</strong>
        <span>${meta}</span>
      </div>
      <div class="amount ${amountClass}">${sign}${fmt(t.amount)}</div>
      <div class="actions">
        <button class="icon-btn edit-tx" data-id="${t.id}">✏️</button>
        <button class="icon-btn delete-tx" data-id="${t.id}">🗑</button>
      </div>
    </li>
  `;
}

function renderDashboard() {
  const txs = currentTransactions();
  const income = txs.filter((t) => t.type === "ingreso").reduce((a, b) => a + b.amount, 0);
  const expense = txs.filter((t) => t.type === "gasto").reduce((a, b) => a + b.amount, 0);
  const balance = income - expense;
  const savingRate = income ? Math.round((balance / income) * 100) : 0;

  $("totalIncome").textContent = fmt(income);
  $("totalExpense").textContent = fmt(expense);
  $("netBalance").textContent = fmt(balance);
  $("savingRate").textContent = `${savingRate}%`;

  $("savingGoalLabel").textContent = `Meta de ahorro: ${fmt(state.savingGoal)}`;
  $("budgetSpentLabel").textContent = `${fmt(expense)} gastado`;

  const progress = state.savingGoal > 0 ? Math.max(0, Math.min(100, (balance / state.savingGoal) * 100)) : 0;
  $("budgetFill").style.width = `${progress}%`;

  const recent = [...txs]
    .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`))
    .slice(0, 5);

  $("recentTransactions").innerHTML = recent.length
    ? recent.map(buildTransactionItem).join("")
    : `<li><div class="item-main"><strong>Sin transacciones</strong><span>Cargá tu primer movimiento</span></div></li>`;

  renderCategoryBreakdown(txs);
  attachTransactionActions($("recentTransactions"));
}

function renderCategoryBreakdown(txs) {
  const expenses = txs.filter((t) => t.type === "gasto");
  const total = expenses.reduce((a, b) => a + b.amount, 0);

  if (!expenses.length) {
    $("categoryBreakdown").innerHTML = `<div class="cat-row"><span>Sin datos</span><span>—</span></div>`;
    return;
  }

  const grouped = {};
  for (const tx of expenses) {
    const key = tx.categoryId || "none";
    grouped[key] = (grouped[key] || 0) + tx.amount;
  }

  $("categoryBreakdown").innerHTML = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => {
      const cat = getCategory(id);
      const name = cat ? `${cat.emoji} ${cat.name}` : "Sin categoría";
      const pct = total ? Math.round((amount / total) * 100) : 0;

      return `
        <div class="cat-row">
          <span>${name} (${pct}%)</span>
          <strong>${fmt(amount)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderIncomeList() {
  const txs = currentTransactions()
    .filter((t) => t.type === "ingreso")
    .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`));

  $("incomeTotal").textContent = fmt(txs.reduce((a, b) => a + b.amount, 0));
  $("incomeList").innerHTML = txs.length
    ? txs.map(buildTransactionItem).join("")
    : `<li><div class="item-main"><strong>Sin ingresos</strong><span>No cargaste ingresos este mes</span></div></li>`;

  attachTransactionActions($("incomeList"));
}

function renderExpenseList() {
  const txs = currentTransactions()
    .filter((t) => t.type === "gasto")
    .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`));

  $("expenseTotal").textContent = fmt(txs.reduce((a, b) => a + b.amount, 0));
  $("expenseList").innerHTML = txs.length
    ? txs.map(buildTransactionItem).join("")
    : `<li><div class="item-main"><strong>Sin gastos</strong><span>No cargaste gastos este mes</span></div></li>`;

  attachTransactionActions($("expenseList"));
}

function attachTransactionActions(container) {
  container.querySelectorAll(".delete-tx").forEach((btn) => {
    btn.onclick = () => {
      state.transactions = state.transactions.filter((t) => t.id !== btn.dataset.id);
      saveState();
      renderAll();
      showToast("Transacción eliminada");
    };
  });

  container.querySelectorAll(".edit-tx").forEach((btn) => {
    btn.onclick = () => openTransactionModal(btn.dataset.id);
  });
}

function renderCategories() {
  $("defaultCategoriesGrid").innerHTML = PRESET_CATEGORIES.map((c) => `
    <div class="chip">
      <span>${c.emoji} ${c.name}</span>
      <small>${c.type}</small>
    </div>
  `).join("");

  $("categoriesGrid").innerHTML = state.categories.length
    ? state.categories.map((c) => `
      <div class="chip">
        <span>${c.emoji} ${c.name}</span>
        <div class="actions">
          <small>${c.type}</small>
          <button class="icon-btn delete-cat" data-id="${c.id}">✕</button>
        </div>
      </div>
    `).join("")
    : `<div class="chip"><span>Sin categorías personalizadas</span></div>`;

  document.querySelectorAll(".delete-cat").forEach((btn) => {
    btn.onclick = () => {
      state.categories = state.categories.filter((c) => c.id !== btn.dataset.id);
      state.transactions = state.transactions.map((t) =>
        t.categoryId === btn.dataset.id ? { ...t, categoryId: null } : t
      );
      saveState();
      renderAll();
      updateCategorySelect("quickCategory", quickType);
      updateCategorySelect("txCategory", txType);
      showToast("Categoría eliminada");
    };
  });
}

function renderGoals() {
  $("goalsGrid").innerHTML = state.goals.length
    ? state.goals.map((g) => {
        const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
        return `
          <div class="goal-card">
            <div class="top">
              <div>
                <strong>${g.emoji} ${g.name}</strong>
                <small>${g.deadline ? `Límite: ${new Date(`${g.deadline}T00:00:00`).toLocaleDateString("es-AR")}` : "Sin fecha límite"}</small>
              </div>
              <div class="actions">
                <button class="icon-btn edit-goal" data-id="${g.id}">✏️</button>
                <button class="icon-btn delete-goal" data-id="${g.id}">🗑</button>
              </div>
            </div>
            <div><strong>${fmt(g.current)}</strong> de ${fmt(g.target)}</div>
            <div class="progress"><div style="width:${pct}%"></div></div>
            <small>${pct}% completado</small>
          </div>
        `;
      }).join("")
    : `<div class="card">No tenés metas todavía.</div>`;

  document.querySelectorAll(".delete-goal").forEach((btn) => {
    btn.onclick = () => {
      state.goals = state.goals.filter((g) => g.id !== btn.dataset.id);
      saveState();
      renderGoals();
      showToast("Meta eliminada");
    };
  });

  document.querySelectorAll(".edit-goal").forEach((btn) => {
    btn.onclick = () => openGoalModal(btn.dataset.id);
  });
}

function renderAll() {
  renderDashboard();
  renderIncomeList();
  renderExpenseList();
  renderCategories();
  renderGoals();
}

function resetTransactionModal(type = "ingreso", locked = false) {
  editingTxId = null;
  txType = type;

  $("modalTitle").textContent = locked
    ? type === "ingreso" ? "Agregar ingreso" : "Agregar gasto"
    : "Agregar transacción";

  $("txDescription").value = "";
  $("txAmount").value = "";
  $("txDate").value = todayStr();
  $("txNote").value = "";
  $("txTabToggle").style.display = locked ? "none" : "flex";

  document.querySelectorAll("#txTabToggle .tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });

  updateCategorySelect("txCategory", type);
  $("txCategory").value = "";
}

function openTransactionModal(id = null, forcedType = null) {
  if (!id) {
    resetTransactionModal(forcedType || "ingreso", !!forcedType);
    openModal("transactionModal");
    return;
  }

  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;

  editingTxId = id;
  txType = tx.type;

  $("modalTitle").textContent = "Editar transacción";
  $("txTabToggle").style.display = "flex";

  document.querySelectorAll("#txTabToggle .tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === tx.type);
  });

  $("txDescription").value = tx.description;
  $("txAmount").value = fmtNum(tx.amount);
  $("txDate").value = tx.date;
  $("txNote").value = tx.note || "";
  updateCategorySelect("txCategory", tx.type);
  $("txCategory").value = tx.categoryId || "";

  openModal("transactionModal");
}

function saveTransaction() {
  const description = $("txDescription").value.trim();
  const amount = parseNumber($("txAmount").value);
  const date = $("txDate").value;
  const categoryId = $("txCategory").value || null;
  const note = $("txNote").value.trim();

  if (!description || !amount || !date) {
    showToast("Completá descripción, monto y fecha");
    return;
  }

  if (editingTxId) {
    const tx = state.transactions.find((t) => t.id === editingTxId);
    Object.assign(tx, { type: txType, description, amount, date, categoryId, note });
    showToast("Transacción actualizada");
  } else {
    state.transactions.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      type: txType,
      description,
      amount,
      date,
      categoryId,
      note
    });
    showToast("Transacción agregada");
  }

  saveState();
  closeModal("transactionModal");
  renderAll();
}

function openGoalModal(id = null) {
  editingGoalId = id;

  if (!id) {
    $("goalModalTitle").textContent = "Nueva meta";
    $("goalName").value = "";
    $("goalTarget").value = "";
    $("goalCurrent").value = "";
    $("goalDeadline").value = "";
    $("goalEmoji").value = "🎯";
    openModal("goalModal");
    return;
  }

  const goal = state.goals.find((g) => g.id === id);
  if (!goal) return;

  $("goalModalTitle").textContent = "Editar meta";
  $("goalName").value = goal.name;
  $("goalTarget").value = fmtNum(goal.target);
  $("goalCurrent").value = fmtNum(goal.current);
  $("goalDeadline").value = goal.deadline || "";
  $("goalEmoji").value = goal.emoji || "🎯";
  openModal("goalModal");
}

function saveGoal() {
  const name = $("goalName").value.trim();
  const target = parseNumber($("goalTarget").value);
  const current = parseNumber($("goalCurrent").value);
  const deadline = $("goalDeadline").value;
  const emoji = $("goalEmoji").value;

  if (!name || !target) {
    showToast("Completá nombre y monto objetivo");
    return;
  }

  if (editingGoalId) {
    const goal = state.goals.find((g) => g.id === editingGoalId);
    Object.assign(goal, { name, target, current, deadline, emoji });
    showToast("Meta actualizada");
  } else {
    state.goals.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      target,
      current,
      deadline,
      emoji
    });
    showToast("Meta creada");
  }

  saveState();
  closeModal("goalModal");
  renderGoals();
}

function saveQuickTransaction() {
  const description = $("quickDesc").value.trim();
  const amount = parseNumber($("quickAmount").value);
  const date = $("quickDate").value;
  const categoryId = $("quickCategory").value || null;

  if (!description || !amount || !date) {
    showToast("Completá descripción, monto y fecha");
    return;
  }

  state.transactions.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: quickType,
    description,
    amount,
    date,
    categoryId,
    note: ""
  });

  saveState();
  $("quickDesc").value = "";
  $("quickAmount").value = "";
  $("quickDate").value = todayStr();
  $("quickCategory").value = "";
  renderAll();
  showToast("Movimiento agregado");
}

function initEvents() {
  $("prevMonth").onclick = () => {
    if (state.currentMonth === 0) {
      state.currentMonth = 11;
      state.currentYear--;
    } else {
      state.currentMonth--;
    }
    setMonthLabel();
    renderAll();
  };

  $("nextMonth").onclick = () => {
    if (state.currentMonth === 11) {
      state.currentMonth = 0;
      state.currentYear++;
    } else {
      state.currentMonth++;
    }
    setMonthLabel();
    renderAll();
  };

  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.onclick = () => navigate(btn.dataset.section);
  });

  $("sidebarToggle").onclick = () => $("sidebar").classList.toggle("open");

  document.querySelectorAll(".quick-tab").forEach((btn) => {
    btn.onclick = () => {
      quickType = btn.dataset.qtype;
      document.querySelectorAll(".quick-tab").forEach((b) => b.classList.toggle("active", b === btn));
      updateCategorySelect("quickCategory", quickType);
    };
  });

  document.querySelectorAll("#txTabToggle .tab-btn").forEach((btn) => {
    btn.onclick = () => {
      txType = btn.dataset.type;
      document.querySelectorAll("#txTabToggle .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      updateCategorySelect("txCategory", txType);
    };
  });

  $("quickSaveBtn").onclick = saveQuickTransaction;
  $("addIncomeBtn").onclick = () => openTransactionModal(null, "ingreso");
  $("addExpenseBtn").onclick = () => openTransactionModal(null, "gasto");
  $("saveTransaction").onclick = saveTransaction;

  $("closeTransactionModal").onclick = () => closeModal("transactionModal");
  $("cancelTransaction").onclick = () => closeModal("transactionModal");

  $("addCategoryBtn").onclick = () => openModal("categoryModal");
  $("closeCategoryModal").onclick = () => closeModal("categoryModal");
  $("cancelCategory").onclick = () => closeModal("categoryModal");

  $("saveCategory").onclick = () => {
    const name = $("catName").value.trim();
    if (!name) {
      showToast("Ingresá un nombre");
      return;
    }

    state.categories.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      emoji: $("catEmoji").value,
      color: $("catColor").value,
      type: $("catType").value
    });

    saveState();
    closeModal("categoryModal");
    $("catName").value = "";
    updateCategorySelect("quickCategory", quickType);
    updateCategorySelect("txCategory", txType);
    renderCategories();
    showToast("Categoría creada");
  };

  $("setSavingGoalBtn").onclick = () => {
    $("savingGoalInput").value = state.savingGoal ? fmtNum(state.savingGoal) : "";
    openModal("savingGoalModal");
  };

  $("closeSavingGoalModal").onclick = () => closeModal("savingGoalModal");
  $("cancelSavingGoal").onclick = () => closeModal("savingGoalModal");
  $("saveSavingGoal").onclick = () => {
    state.savingGoal = parseNumber($("savingGoalInput").value);
    saveState();
    closeModal("savingGoalModal");
    renderDashboard();
    showToast("Meta de ahorro actualizada");
  };

  $("addGoalBtn").onclick = () => openGoalModal();
  $("saveGoal").onclick = saveGoal;
  $("closeGoalModal").onclick = () => closeModal("goalModal");
  $("cancelGoal").onclick = () => closeModal("goalModal");

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });
}

function init() {
  loadState();
  setMonthLabel();
  $("quickDate").value = todayStr();

  [
    "quickAmount",
    "txAmount",
    "savingGoalInput",
    "goalTarget",
    "goalCurrent"
  ].forEach((id) => formatInputNumber($(id)));

  updateCategorySelect("quickCategory", quickType);
  updateCategorySelect("txCategory", txType);

  initEvents();
  navigate("dashboard");
  renderAll();
}

init();