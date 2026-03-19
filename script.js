// ── Busca geocode IBGE ──
async function buscarGeocode(nomeCidade) {
    const query = encodeURIComponent(nomeCidade);
    const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${query}`);
    if (!resp.ok) throw new Error("Erro IBGE");
    const data = await resp.json();
    if (!data || data.length === 0) return null;
    const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nomeNorm = norm(nomeCidade);
    const exato = data.find(m => norm(m.nome) === nomeNorm);
    const resultado = exato || data[0];
    return {
        geocode: resultado.id,
        nome: resultado.nome,
        uf: resultado.microrregiao.mesorregiao.UF.sigla
    };
}

// ── Nivel de alerta ──
function nivelLabel(nivel) {
    const map = {
        1: { texto: "Verde (Baixo)", classe: "nivel-1" },
        2: { texto: "Amarelo (Medio)", classe: "nivel-2" },
        3: { texto: "Laranja (Alto)", classe: "nivel-3" },
        4: { texto: "Vermelho (Muito Alto)", classe: "nivel-4" }
    };
    return map[nivel] || { texto: "Desconhecido", classe: "nivel-1" };
}

// ── Radar -- API AlertaDengue (pública, direto) ──
async function verificarRadar() {
    const inputRaw = document.getElementById("cidadeInput").value.trim();
    const anoVal = document.getElementById("anoSelect").value;
    const semanaVal = document.getElementById("semanaSelect").value;
    const [ewStart, ewEnd] = semanaVal.split("-");

    const container = document.getElementById("containerRadar");
    container.style.display = "block";
    container.style.borderLeftColor = "var(--vermelho)";

    if (!inputRaw) {
        container.innerHTML = "Digite uma cidade para consultar.";
        return;
    }

    container.innerHTML = '<span class="loading">Buscando município "' + inputRaw + '" na base do IBGE...</span>';

    let geocode, cidadeNome, cidadeUF;
    try {
        const resultado = await buscarGeocode(inputRaw);
        if (!resultado) {
            container.innerHTML = 'Cidade <strong>"' + inputRaw + '"</strong> não encontrada. Verifique o nome e tente novamente.';
            return;
        }
        geocode = resultado.geocode;
        cidadeNome = resultado.nome;
        cidadeUF = resultado.uf;
    } catch(e) {
        container.innerHTML = "Erro ao buscar o município na API do IBGE. Verifique sua conexão.";
        return;
    }

    container.innerHTML = '<span class="loading">Buscando dados de dengue em ' + cidadeNome + '/' + cidadeUF + '...</span>';

    let data = null;
    const apiUrl = `https://info.dengue.mat.br/api/alertcity?geocode=${geocode}&disease=dengue&format=json&ew_start=${ewStart}&ew_end=${ewEnd}&ey_start=${anoVal}&ey_end=${anoVal}`;

    try {
        const resp = await fetch(apiUrl);
        if (resp.ok) {
            data = await resp.json();
            if (!Array.isArray(data) || data.length === 0) data = null;
        }
    } catch(e) {
        console.error("Erro ao consultar AlertaDengue:", e);
    }

    if (!data) {
        container.innerHTML = `Nenhum dado encontrado para <strong>${cidadeNome}/${cidadeUF}</strong> no período selecionado. A cidade pode não estar na base do AlertaDengue.`;
        return;
    }

    const recentes = data.slice(-8).reverse();
    const ultimo = recentes[0];
    const nivelAtual = nivelLabel(ultimo.nivel);
    const totalCasos = data.reduce((acc, d) => acc + (d.casos || 0), 0);

    let html = '<div class="radar-info">';
    html += '<strong>' + cidadeNome + '/' + cidadeUF + '</strong>';
    html += ' &mdash; ' + anoVal + ', semanas ' + ewStart + '&ndash;' + ewEnd + ' &nbsp;|&nbsp; ';
    html += 'Total: <strong>' + totalCasos.toLocaleString('pt-BR') + ' casos</strong> &nbsp;|&nbsp; ';
    html += 'Alerta atual: <span class="nivel-badge ' + nivelAtual.classe + '">' + nivelAtual.texto + '</span>';
    html += '</div>';
    html += '<table class="radar-table"><thead><tr>';
    html += '<th>Semana Epi.</th><th>Casos</th><th>Casos Estimados</th><th>Inc. / 100k hab.</th><th>Alerta</th>';
    html += '</tr></thead><tbody>';

    recentes.forEach(function(item) {
        const se = String(item.SE || item.se || "");
        const semana = se.length >= 6 ? se.slice(0,4) + " / SE " + se.slice(4) : se;
        const casos = (item.casos || 0).toLocaleString('pt-BR');
        const casosEst = Math.round(item.casos_est || item.casos_estmax || 0).toLocaleString('pt-BR');
        const inc = (item.p_inc100k || item.inc || 0).toFixed(2);
        const nivel = nivelLabel(item.nivel);
        html += '<tr>';
        html += '<td>' + semana + '</td>';
        html += '<td>' + casos + '</td>';
        html += '<td>' + casosEst + '</td>';
        html += '<td>' + inc + '</td>';
        html += '<td><span class="nivel-badge ' + nivel.classe + '">' + nivel.texto + '</span></td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ── Real ou Fake — Claude API via proxy Vercel ──
async function verificarNoticia() {
    const noticia = document.getElementById('noticiaInput').value.trim();
    if (!noticia) return alert("Digite uma notícia!");

    const container = document.getElementById('containerFake');
    container.style.display = 'block';
    container.innerHTML = '<span class="loading">Analisando notícia...</span>';

    try {
        const response = await fetch("/api/claude", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                messages: [{
                    role: "user",
                    content: `Você é um verificador de fatos especializado em saúde e dengue. Analise a seguinte afirmação ou notícia e diga se é REAL ou FAKE, com uma breve explicação. Comece com "✅ REAL" ou "❌ FAKE" e explique em 2-3 frases. Notícia: "${noticia}". Responda em português.`
                }]
            })
        });
        const data = await response.json();
        const resposta = data.content.map(i => i.text || "").join("\n");
        container.innerHTML = resposta.replace(/\n/g, '<br>');
    } catch(e) {
        container.innerHTML = 'Erro ao consultar. Verifique sua conexão.';
    }
}

// ── Gráfico ──
const regioes = ['Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte'];
const incidencia = [4739.8, 3949.0, 3894.1, 600.1, 284.2];
const cores = [
    'rgba(211,47,47,0.85)',
    'rgba(230,81,0,0.85)',
    'rgba(249,168,37,0.85)',
    'rgba(30,136,229,0.85)',
    'rgba(56,142,60,0.85)'
];

new Chart(document.getElementById('graficoDengue').getContext('2d'), {
    type: 'bar',
    data: {
        labels: regioes,
        datasets: [{
            label: 'Casos por 100 000 hab.',
            data: incidencia,
            backgroundColor: cores,
            borderColor: cores.map(c => c.replace('0.85','1')),
            borderWidth: 1,
            borderRadius: 8
        }]
    },
    options: {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: 'Incidência de Dengue por Região — Brasil 2024 (até SE 26)',
                font: { size: 14, family: 'DM Sans' },
                color: '#333',
                padding: { bottom: 16 }
            },
            tooltip: {
                callbacks: {
                    label: ctx => ctx.parsed.y.toLocaleString('pt-BR') + ' casos/100k hab.'
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Casos por 100 000 hab.', font: { family: 'DM Sans' } },
                grid: { color: 'rgba(0,0,0,0.06)' }
            },
            x: { grid: { display: false } }
        }
    }
});

// ── Enter nos inputs ──
document.getElementById('cidadeInput').addEventListener('keydown', e => { if(e.key === 'Enter') verificarRadar(); });
document.getElementById('noticiaInput').addEventListener('keydown', e => { if(e.key === 'Enter') verificarNoticia(); });
