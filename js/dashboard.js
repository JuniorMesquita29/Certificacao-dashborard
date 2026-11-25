/* Dashboard de certificação. Todos os números saem de data/metrics.json. */

const NAVY = "#001489";
const RED = "#E10600";
const BLUE = "#1F4CFF";
const WINE = "#8A0010";
const FONT = 'Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif';

const VOLUME_WINDOW = 16;
const LEAD_MIN_N = 10;
const LEAD_MONTHS = 12;

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CLASS_ORDER = [
  "Sem certificação",
  "Em análise / sem resposta",
  "Precisa certificação",
  "Indefinido",
];

const CLASS_COLORS = {
  "Sem certificação": NAVY,
  "Em análise / sem resposta": RED,
  "Precisa certificação": BLUE,
  "Indefinido": WINE,
};

const OPEN_LABELS = {
  "Sem certificação": "Sem certificação (aguardando outra etapa)",
  "Em análise / sem resposta": "Em análise / sem resposta",
  "Precisa certificação": "Precisa certificação",
  "Indefinido": "Indefinido",
};

const STAGE_ORDER = [
  "Backlog (sem etapa)",
  "Prioridade (provável)",
  "Info. pend. (provável)",
  "AG. COTAÇÃO (provável)",
];

const TYPE_ORDER = ["INMETRO", "ANATEL", "ANVISA", "MAPA", "Exército", "IBAMA"];

const NCM_NAMES = {
  "4202": "Malas e bolsas",
  "8543": "Máquinas elétricas diversas",
  "8528": "Monitores e projetores",
  "8481": "Válvulas e torneiras",
  "8422": "Máquinas de lavar louça e envasar",
  "3926": "Obras de plástico",
  "9503": "Brinquedos",
  "9506": "Artigos esportivos",
  "8428": "Elevação e movimentação",
  "8418": "Refrigeradores e congeladores",
  "8711": "Motocicletas",
  "8413": "Bombas para líquidos",
};

const AGE_TONE = {
  "< 7 dias": "",
  "7–30 dias": "",
  "30–90 dias": "red",
  "90–365 dias": "wine",
  "> 1 ano": "wine",
};

const charts = {};
let metrics = null;

const fmt = (n) => Number(n).toLocaleString("pt-BR");
const dec = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function labelMonth(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return String(ym);
  return `${MONTHS_PT[m - 1]}/${String(y).slice(2)}`;
}

function labelMonthYear(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return String(ym);
  return `${MONTHS_PT[m - 1]}/${y}`;
}

function parseAsof(s) {
  const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return { day: m[1], month: m[2], year: m[3], key: `${m[3]}-${m[2]}` };
}

function parseBRDate(s) {
  const [d, m, y] = String(s || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function count(obj, key) {
  const v = obj?.[key];
  return typeof v === "number" ? v : 0;
}

function orderedEntries(obj, order) {
  return Object.keys(obj || {}).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "pt-BR");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  }).map((key) => [key, obj[key]]);
}

function stagesForFila(data, openExpected) {
  const stages = data.stages_open || {};
  if (stages["1636047"]) return stages["1636047"];
  if (stages["Certificação (fila geral)"]) return stages["Certificação (fila geral)"];
  const entries = Object.entries(stages);
  if (entries.length === 1) return entries[0][1];
  for (const [, value] of entries) {
    const sum = Object.values(value).reduce((acc, n) => acc + num(n), 0);
    if (sum === openExpected) return value;
  }
  return null;
}

function statusTone(text) {
  if (text === "Precisa certificação" || text === "Aberta") return "accent";
  if (text === "Sem certificação" || text === "Concluída") return "neutral";
  return "warning";
}

function statusPill(text) {
  const pill = document.createElement("span");
  pill.className = `status status-${statusTone(text || "")}`;
  pill.textContent = text || "—";
  return pill;
}

function emptyNote(container, text) {
  container.replaceChildren();
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  container.append(p);
}

function renderBars(container, items) {
  container.replaceChildren();
  if (!items.length) {
    emptyNote(container, "Nenhum registro neste recorte.");
    return;
  }
  const max = Math.max(...items.map((item) => num(item.value)), 0);
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = item.label;
    label.title = item.label;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill" + (item.tone ? ` ${item.tone}` : "");
    const value = num(item.value);
    fill.style.width = `${max > 0 ? (value / max) * 100 : 0}%`;
    if (value > 0) fill.style.minWidth = "3px";
    track.append(fill);
    const numEl = document.createElement("div");
    numEl.className = "bar-value";
    numEl.textContent = item.display ?? fmt(value);
    row.append(label, track, numEl);
    container.append(row);
  }
}

function renderKpis(metricsList) {
  const container = document.getElementById("kpis");
  container.replaceChildren();
  for (const item of metricsList) {
    const card = document.createElement("article");
    card.className = "kpi" + (item.tone ? ` kpi-${item.tone}` : "");
    const value = document.createElement("p");
    value.className = "value" + (String(item.value).length > 16 ? " value-sm" : "");
    value.textContent = item.value;
    const label = document.createElement("p");
    label.className = "label";
    label.textContent = item.label;
    const detail = document.createElement("p");
    detail.className = "detail";
    detail.textContent = item.detail;
    card.append(value, label, detail);
    container.append(card);
  }
}

function showChartFallback(canvas) {
  const host = canvas.parentElement;
  if (!host || host.querySelector(".chart-fallback")) return;
  canvas.hidden = true;
  const p = document.createElement("p");
  p.className = "chart-fallback";
  p.textContent = "Gráfico indisponível: Chart.js não carregou.";
  host.append(p);
}

const valueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart, _args, opts) {
    const decimals = Boolean(opts && opts.decimals);
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = "#050505";
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = "center";
    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      let lastRight = -Infinity;
      meta.data.forEach((el, i) => {
        const v = dataset.data[i];
        if (typeof v !== "number") return;
        const text = decimals ? dec(v) : fmt(v);
        const width = ctx.measureText(text).width;
        const left = el.x - width / 2;
        if (left < lastRight + 4) return;
        ctx.fillText(text, el.x, el.y - 6);
        lastRight = el.x + width / 2;
      });
    });
    ctx.restore();
  },
};

function mountChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (typeof Chart !== "function") {
    showChartFallback(canvas);
    return;
  }
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(canvas, config);
}

function seriesColors(index) {
  return index === 0 ? NAVY : RED;
}

function columnChart({ labels, datasets, decimals = false, showValues = false, horizontal = false, suggestedMax = null }) {
  const valueAxis = {
    beginAtZero: true,
    grid: { color: "#e6ecf7" },
    border: { display: false },
      ticks: {
      color: "#050505",
      precision: decimals ? undefined : 0,
      callback: (v) => (!decimals || Number.isInteger(Number(v)) ? fmt(v) : dec(v)),
      font: { size: 12 },
    },
  };
  if (suggestedMax) valueAxis.suggestedMax = suggestedMax;
  const categoryAxis = {
    grid: { display: false },
    border: { display: false },
    ticks: { color: "#050505", autoSkip: false, maxRotation: horizontal ? 0 : 55, minRotation: 0, font: { size: 11 } },
  };
  if (horizontal) categoryAxis.reverse = false;
  const maxValue = Math.max(...datasets.flatMap((d) => d.data.map((n) => num(n))), 0);
  if (showValues && !horizontal && maxValue > 0) valueAxis.suggestedMax = maxValue * 1.18;

  return {
    type: "bar",
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.color || seriesColors(i),
        borderRadius: 3,
        maxBarThickness: horizontal ? 14 : 36,
        clip: false,
      })),
    },
    plugins: showValues ? [valueLabels] : [],
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: showValues ? 8 : 4, right: 4 } },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: "#050505", boxWidth: 12, boxHeight: 12, padding: 14, font: { size: 12 } } },
        valueLabels: { decimals },
        tooltip: {
          backgroundColor: "#050505",
          callbacks: {
            label(ctx) {
              const raw = horizontal ? ctx.parsed.x : ctx.parsed.y;
              const shown = decimals ? dec(raw) : fmt(raw);
              return ctx.dataset.label ? `${ctx.dataset.label}: ${shown}` : shown;
            },
          },
        },
      },
      scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
    },
  };
}

function renderVolume(data, range) {
  const all = Array.isArray(data.monthly) ? data.monthly : [];
  const rows = range === "16m" ? all.slice(-VOLUME_WINDOW) : all;
  const caption = document.getElementById("volume-caption");
  const inner = document.getElementById("volume-inner");
  if (!rows.length) {
    caption.textContent = "A extração não trouxe a série mensal.";
    return;
  }
  caption.textContent = range === "all"
    ? `Série completa: ${fmt(rows.length)} meses.`
    : `Últimos ${fmt(rows.length)} meses.`;
  inner.style.width = range === "all" ? `${Math.max(rows.length * 48, 640)}px` : "100%";
  mountChart("chart-volume", columnChart({
    labels: rows.map((row) => labelMonth(row.m)),
    datasets: [
      { label: "Criadas", data: rows.map((row) => num(row.created)) },
      { label: "Concluídas", data: rows.map((row) => num(row.completed)), color: RED },
    ],
    showValues: false,
  }));
}

function leadMonthRows(monthly) {
  return (monthly || []).filter((row) => num(row.lead_n) >= LEAD_MIN_N && typeof row.lead_median === "number").slice(-LEAD_MONTHS);
}

function funnelNote(ctx) {
  const { fetched, infoTotal, filaOpen, sample, unclassified, semComentario, both, precisa } = ctx;
  let text = `A classificação cobre só as ${fmt(fetched)} tasks com comentários buscados`;
  if (sample >= 0 && unclassified >= 0 && infoTotal + filaOpen + sample === fetched) {
    text += `: todas da Info. Pendente (${fmt(infoTotal)}), todas as abertas da fila geral (${fmt(filaOpen)}) e as ${fmt(sample)} concluídas mais recentes. As outras ${fmt(unclassified)} concluídas da fila geral não foram classificadas.`;
  } else {
    text += ".";
  }
  if (semComentario > 0) {
    text += ` Das ${fmt(fetched)} buscadas, ${fmt(semComentario)} não têm comentário e também ficam de fora.`;
  }
  if (both > 0 && both === precisa) {
    text += ` Nas ${fmt(precisa)} que precisam de certificação, os comentários também trazem um cenário "sem certificação".`;
  } else if (both > 0) {
    text += ` Em ${fmt(both)} das ${fmt(precisa)} que precisam de certificação, os comentários também trazem um cenário "sem certificação".`;
  }
  return text;
}

function aguardText(rows) {
  if (!rows || !rows.length) {
    return 'Nenhuma task com a tag "Aguard. Cert." aparece na extração, então o número de projetos travados por certificado não pode ser medido.';
  }
  const open = rows.filter((row) => row.status === "Aberta").length;
  const done = rows.length - open;
  const latest = rows.reduce((best, row) => {
    const dt = parseBRDate(row.created);
    if (!dt) return best;
    if (!best || dt > best.dt) return { dt, created: row.created };
    return best;
  }, null);
  const when = latest ? labelMonthYear(`${latest.created.slice(6, 10)}-${latest.created.slice(3, 5)}`) : null;
  let text = `A tag "Aguard. Cert." (projeto esperando certificado) aparece em ${fmt(rows.length)} ${rows.length === 1 ? "task" : "tasks"}`;
  if (open === 0) {
    text += when
      ? `, todas concluídas, a mais recente de ${when}. Hoje nenhuma task aberta usa essa tag, então o número de projetos travados por certificado não pode ser medido.`
      : ". Hoje nenhuma task aberta usa essa tag, então o número de projetos travados por certificado não pode ser medido.";
  } else {
    text += ` (${fmt(open)} ${open === 1 ? "aberta" : "abertas"} e ${fmt(done)} ${done === 1 ? "concluída" : "concluídas"}).`;
    if (when) text += ` A mais recente foi criada em ${when}.`;
  }
  return text;
}

function leadSummary(lead, monthly) {
  if (!lead || typeof lead.median !== "number") return "";
  let text = `Mediana geral de ${dec(lead.median)} dias`;
  if (typeof lead.p75 === "number") text += `, p75 de ${dec(lead.p75)}`;
  if (typeof lead.p90 === "number") text += ` e p90 de ${dec(lead.p90)}`;
  text += ".";
  if (typeof lead.median90d === "number") {
    text += ` Nos últimos 90 dias a mediana é de ${dec(lead.median90d)} dias (${fmt(num(lead.n90d))} concluídas).`;
  }
  const top = [...(monthly || [])].filter((row) => num(row.created) > 0).sort((a, b) => num(b.created) - num(a.created)).slice(0, 3);
  if (top.length) {
    text += ` Os três meses com mais tasks criadas são ${top.map((row) => `${labelMonth(row.m)} (${fmt(row.created)})`).join(", ")}.`;
  }
  return text;
}

function renderPending(rows) {
  document.getElementById("pending-title").textContent = `Paradas em Info. Pendente Certificação (${fmt(rows.length)} abertas)`;
  const body = document.getElementById("pending-body");
  body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "Nenhuma task aberta nesta lista.";
    tr.append(cell);
    body.append(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    const task = document.createElement("td");
    task.className = "task";
    task.textContent = `${row.name} (#${row.id})`;
    const created = document.createElement("td");
    created.className = "nowrap";
    created.textContent = row.created || "—";
    const dias = document.createElement("td");
    dias.className = "num emph";
    if (num(row.dias) >= 60) dias.classList.add("danger");
    else if (num(row.dias) >= 30) dias.classList.add("warn");
    dias.textContent = fmt(num(row.dias));
    const mov = document.createElement("td");
    mov.className = "num";
    mov.textContent = fmt(num(row.dias_sem_mov));
    const analista = document.createElement("td");
    analista.textContent = row.analista || "—";
    const comercial = document.createElement("td");
    comercial.textContent = row.comercial || "—";
    const resp = document.createElement("td");
    resp.append(statusPill(row.cls));
    tr.append(task, created, dias, mov, analista, comercial, resp);
    body.append(tr);
  }
}

function renderPrecisa(rows) {
  const body = document.getElementById("precisa-body");
  body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Nenhuma task classificada como precisa de certificação.";
    tr.append(cell);
    body.append(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    const task = document.createElement("td");
    task.className = "task";
    task.textContent = `${row.name} (#${row.id})`;
    const status = document.createElement("td");
    status.append(statusPill(row.status));
    const organ = document.createElement("td");
    organ.textContent = !row.types || row.types === "—" ? "Não citado" : row.types;
    const created = document.createElement("td");
    created.className = "nowrap";
    created.textContent = row.created || "—";
    tr.append(task, status, organ, created);
    body.append(tr);
  }
}

function renderTypeMetrics(data, precisaTotal) {
  const host = document.getElementById("type-metrics");
  host.replaceChildren();
  const openPrecisa = count(data.class?.open_counts, "Precisa certificação");
  const entries = Object.entries(data.types || {}).filter(([, n]) => num(n) > 0);
  entries.sort((a, b) => num(b[1]) - num(a[1]) || TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]));
  const cards = [
    {
      value: fmt(openPrecisa),
      label: "Abertas que precisam",
      detail: `de ${fmt(precisaTotal)} identificadas`,
    },
  ];
  if (entries.length) {
    const topValue = num(entries[0][1]);
    const names = entries.filter(([, n]) => num(n) === topValue).map(([name]) => name);
    cards.push({
      value: names.join(" e "),
      label: names.length > 1 ? "Órgãos mais citados" : "Órgão mais citado",
      detail: `${fmt(topValue)} das ${fmt(precisaTotal)}`,
    });
  }
  for (const item of cards) {
    const card = document.createElement("article");
    card.className = "kpi";
    const value = document.createElement("p");
    value.className = "value" + (item.value.length > 16 ? " value-sm" : "");
    value.textContent = item.value;
    const label = document.createElement("p");
    label.className = "label";
    label.textContent = item.label;
    const detail = document.createElement("p");
    detail.className = "detail";
    detail.textContent = item.detail;
    card.append(value, label, detail);
    host.append(card);
  }
}

function render(data) {
  const fila = data.lists?.["Certificação (fila geral)"] || {};
  const info = data.lists?.["Info. Pendente Certificação"] || {};
  const filaOpen = num(fila.Aberta);
  const filaDone = num(fila["Concluída"]);
  const infoOpen = num(info.Aberta);
  const infoDone = num(info["Concluída"]);
  const infoTotal = infoOpen + infoDone;
  const abertas = filaOpen + infoOpen;
  const total = num(data.total);
  const klass = data.class || {};
  const counts = klass.counts || {};
  const fetched = num(klass.fetched);
  const withComments = num(klass.with_comments);
  const precisa = count(counts, "Precisa certificação");
  const both = num(klass.both);
  const sample = fetched - infoTotal - filaOpen;
  const unclassified = filaDone - sample;
  const semComentario = fetched - withComments;
  const asof = parseAsof(data.asof);
  const monthly = Array.isArray(data.monthly) ? data.monthly : [];
  const monthRow = asof ? monthly.find((row) => row.m === asof.key) : monthly[monthly.length - 1];
  const firstMonth = monthly[0]?.m;

  document.getElementById("summary").textContent =
    `Volume, ritmo, pendências e carga da fila de certificação em Projeção de Custos (CLP), com o que falta registrar para medir conversão e margem. Dados de ${data.asof || "—"} (Brasília).`;

  const lead = data.lead || {};
  const analiseAbertas = count(klass.open_counts, "Em análise / sem resposta");
  renderKpis([
    { value: fmt(total), label: "Tasks nas duas listas", detail: firstMonth ? `desde ${labelMonthYear(firstMonth)}` : "nas duas listas" },
    { value: fmt(abertas), label: "Abertas agora", detail: `${fmt(filaOpen)} na fila + ${fmt(infoOpen)} em Info. Pendente` },
    {
      value: monthRow ? fmt(num(monthRow.created)) : "—",
      label: monthRow ? `Criadas em ${labelMonth(monthRow.m)}` : "Criadas no mês da extração",
      detail: asof ? `até ${asof.day}/${asof.month}` : "mês da extração",
    },
    {
      value: typeof lead.median === "number" ? `${dec(lead.median)} dias` : "—",
      label: "Lead time mediano",
      detail: `criação → conclusão, ${fmt(num(lead.n))} concluídas`,
    },
    { value: `${fmt(precisa)} de ${fmt(withComments)}`, label: "Precisam certificação", detail: "entre as tasks com comentários lidos" },
    { value: fmt(analiseAbertas), label: "Em análise sem resposta", detail: "abertas, pedido ao @Certificação", tone: analiseAbertas > 0 ? "warning" : "" },
  ]);

  renderBars(document.getElementById("funnel-bars"), [
    { label: "Tasks na fila (1636047 + 1732324)", value: total, display: fmt(total) },
    { label: "Comentários buscados", value: fetched, display: fmt(fetched) },
    { label: "Com ao menos 1 comentário", value: withComments, display: fmt(withComments) },
    ...CLASS_ORDER.map((name) => ({
      label: name,
      value: count(counts, name),
      display: fmt(count(counts, name)),
      tone: name === "Precisa certificação" ? "red" : name === "Em análise / sem resposta" ? "blue" : name === "Indefinido" ? "wine" : "",
    })),
  ]);

  document.getElementById("pie-title").textContent = `Resposta do Process (${fmt(withComments)} tasks com comentário)`;
  if (withComments > 0) {
    mountChart("chart-pie", {
      type: "doughnut",
      data: {
        labels: CLASS_ORDER.map((name) => `${name} (${fmt(count(counts, name))})`),
        datasets: [{
          data: CLASS_ORDER.map((name) => count(counts, name)),
          backgroundColor: CLASS_ORDER.map((name) => CLASS_COLORS[name]),
          borderWidth: 2,
          borderColor: "#ffffff",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: "58%",
        plugins: {
          legend: { position: "bottom", labels: { color: "#050505", boxWidth: 12, boxHeight: 12, padding: 10, font: { size: 12 } } },
          tooltip: {
            backgroundColor: "#050505",
            callbacks: {
              label(ctx) {
                const value = num(ctx.parsed);
                const pct = withComments ? (value / withComments) * 100 : 0;
                const pctLabel = pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                return `${fmt(value)} (${pctLabel}%)`;
              },
            },
          },
        },
      },
    });
  } else {
    emptyNote(document.getElementById("chart-pie").parentElement, "Nenhuma task com comentário nesta extração.");
  }

  document.getElementById("funnel-note").textContent = funnelNote({
    fetched, infoTotal, filaOpen, sample, unclassified, semComentario, both, precisa,
  });

  renderVolume(data, "16m");

  const openMonths = monthly.filter((row) => num(row.open_now) > 0);
  if (openMonths.length) {
    mountChart("chart-open-month", columnChart({
      labels: openMonths.map((row) => labelMonth(row.m)),
      datasets: [{ label: "Abertas hoje", data: openMonths.map((row) => num(row.open_now)) }],
      showValues: openMonths.length <= 14,
    }));
  }

  const ages = (data.open_age || []).filter((row) => num(row.n) > 0);
  const ageTotal = (data.open_age || []).reduce((acc, row) => acc + num(row.n), 0);
  document.getElementById("age-title").textContent = `Idade das ${fmt(ageTotal)} tasks abertas`;
  renderBars(document.getElementById("age-bars"), ages.map((row) => ({
    label: row.b,
    value: num(row.n),
    display: fmt(row.n),
    tone: AGE_TONE[row.b] || "",
  })));

  const buckets = (lead.buckets || []).filter((row) => num(row.n) > 0);
  document.getElementById("lead-dist-title").textContent = `Distribuição do lead time (${fmt(num(lead.n))} concluídas)`;
  if (buckets.length) {
    mountChart("chart-lead-dist", columnChart({
      labels: buckets.map((row) => row.b),
      datasets: [{ label: "Concluídas", data: buckets.map((row) => num(row.n)) }],
      showValues: true,
    }));
  }

  const leadRows = leadMonthRows(monthly);
  document.getElementById("lead-month-caption").textContent =
    `Só meses com ${LEAD_MIN_N} ou mais tasks concluídas. Nos meses recentes, as tasks ainda abertas puxam a mediana para baixo.`;
  if (leadRows.length) {
    mountChart("chart-lead-month", columnChart({
      labels: leadRows.map((row) => labelMonth(row.m)),
      datasets: [{ label: "Mediana (dias)", data: leadRows.map((row) => row.lead_median) }],
      decimals: true,
      showValues: leadRows.length <= 14,
    }));
  }
  document.getElementById("lead-summary").textContent = leadSummary(lead, monthly);

  const stageMap = stagesForFila(data, filaOpen);
  const stageHost = document.getElementById("stage-bars");
  if (stageMap) {
    const stageItems = orderedEntries(stageMap, STAGE_ORDER).filter(([, n]) => num(n) > 0);
    const stageTotal = stageItems.reduce((acc, [, n]) => acc + num(n), 0);
    document.getElementById("stage-title").textContent = `Abertas por etapa do board (fila geral, ${fmt(stageTotal)})`;
    renderBars(stageHost, stageItems.map(([label, n]) => ({ label, value: num(n), display: fmt(n) })));
  } else {
    document.getElementById("stage-title").textContent = "Abertas por etapa do board (fila geral)";
    emptyNote(stageHost, "A extração não trouxe as etapas da fila geral.");
  }

  const openCounts = klass.open_counts || {};
  const openClassSum = CLASS_ORDER.reduce((acc, name) => acc + count(openCounts, name), 0);
  const openCaption = document.getElementById("open-class-caption");
  if (openClassSum !== abertas) {
    openCaption.hidden = false;
    openCaption.textContent = `Soma das classes: ${fmt(openClassSum)}. Abertas nas listas: ${fmt(abertas)}.`;
  } else {
    openCaption.hidden = true;
  }
  renderBars(document.getElementById("open-class-bars"), CLASS_ORDER.map((name) => ({
    label: OPEN_LABELS[name] || name,
    value: count(openCounts, name),
    display: fmt(count(openCounts, name)),
    tone: name === "Precisa certificação" ? "red" : name === "Em análise / sem resposta" ? "blue" : name === "Indefinido" ? "wine" : "",
  })));

  renderPending(Array.isArray(data.pending) ? data.pending : []);
  document.getElementById("aguard-note").textContent = aguardText(data.aguard_cert || []);

  const typeEntries = Object.entries(data.types || {}).filter(([, n]) => num(n) > 0);
  typeEntries.sort((a, b) => num(b[1]) - num(a[1]) || TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]));
  document.getElementById("type-title").textContent = `Órgão citado nas ${fmt(precisa)} que precisam`;
  let typeCaption = "Uma task pode citar mais de um órgão.";
  if (num(data.types_none) === 1) typeCaption += " Uma delas não cita nenhum.";
  else if (num(data.types_none) > 1) typeCaption += ` ${fmt(data.types_none)} delas não citam nenhum.`;
  document.getElementById("type-caption").textContent = typeCaption;
  renderBars(document.getElementById("type-bars"), typeEntries.map(([label, n]) => ({ label, value: num(n), display: fmt(n) })));
  renderTypeMetrics(data, precisa);
  renderPrecisa(Array.isArray(data.precisa_list) ? data.precisa_list : []);

  const ncm = data.ncm || {};
  const ncmCount = num(ncm.tasks_with_ncm);
  document.getElementById("ncm-caption").textContent =
    `O campo HS Code/NCM só existe no formulário antigo (ago/2023–jul/2025, ${fmt(ncmCount)} tasks). O formulário atual não tem NCM.`;
  const top4 = Array.isArray(ncm.top4) ? ncm.top4 : [];
  renderBars(document.getElementById("ncm-bars"), top4.map(([code, n]) => ({
    label: NCM_NAMES[code] ? `${code} ${NCM_NAMES[code]}` : String(code),
    value: num(n),
    display: fmt(n),
  })));

  const tags = Array.isArray(data.tags) ? data.tags : [];
  renderBars(document.getElementById("tag-bars"), tags.map(([name, n]) => ({
    label: String(name),
    value: num(n),
    display: fmt(n),
  })));

  const analistas = [...(data.load_analista || [])].sort((a, b) => num(b.open) - num(a.open) || num(b.total) - num(a.total));
  const analistaBox = document.getElementById("analista-box");
  analistaBox.style.height = `${Math.max(320, analistas.length * 36 + 72)}px`;
  if (analistas.length) {
    mountChart("chart-analista", columnChart({
      labels: analistas.map((row) => row.name),
      datasets: [
        { label: "Abertas", data: analistas.map((row) => num(row.open)) },
        { label: "Total histórico", data: analistas.map((row) => num(row.total)), color: RED },
      ],
      horizontal: true,
    }));
  }

  const comercial = Array.isArray(data.load_comercial_12m) ? data.load_comercial_12m : [];
  renderBars(document.getElementById("comercial-bars"), comercial.map(([name, n]) => ({
    label: String(name),
    value: num(n),
    display: fmt(n),
  })));
  const done = Array.isArray(data.completed_by_12m) ? data.completed_by_12m : [];
  renderBars(document.getElementById("done-bars"), done.map(([name, n]) => ({
    label: String(name),
    value: num(n),
    display: fmt(n),
  })));

  document.getElementById("method-base").textContent =
    `Base: ${fmt(total)} tasks (fila geral: ${fmt(filaOpen)} abertas e ${fmt(filaDone)} concluídas; Info. Pendente: ${fmt(infoOpen)} abertas e ${fmt(infoDone)} concluídas). Comentários buscados em ${fmt(fetched)} tasks; ${fmt(withComments)} têm ao menos um comentário.`;

  document.getElementById("source").textContent =
    `CLP / Teamwork — projeto 323024 Projeção de Custos, listas Certificação (1636047) e Info. Pendente Certificação (1732324), extraído em ${data.asof || "—"} (Brasília).`;
}

function bindRange() {
  const group = document.getElementById("range-switch");
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !metrics) return;
    for (const item of group.querySelectorAll("button")) {
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    }
    renderVolume(metrics, button.dataset.range);
  });
}

function showError(err) {
  const loading = document.getElementById("loading");
  loading.hidden = true;
  const p = document.createElement("p");
  p.className = "error-banner";
  p.textContent = `Não foi possível carregar data/metrics.json (${err && err.message ? err.message : "erro desconhecido"}). Sirva a pasta por HTTP: abrir o arquivo pelo disco bloqueia a leitura.`;
  loading.after(p);
  document.body.dataset.ready = "error";
}

async function init() {
  if (typeof Chart === "function") {
    Chart.defaults.font.family = FONT;
    Chart.defaults.color = "#050505";
    Chart.defaults.animation = false;
  }
  bindRange();
  const res = await fetch("data/metrics.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`resposta ${res.status}`);
  metrics = await res.json();
  if (!metrics || typeof metrics !== "object" || !Array.isArray(metrics.monthly)) {
    throw new Error("formato inesperado");
  }
  document.getElementById("loading").hidden = true;
  document.getElementById("dashboard").hidden = false;
  render(metrics);
  document.body.dataset.ready = "true";
}

init().catch(showError);
