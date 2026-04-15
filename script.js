async function buscarGeocode(nomeCidade) {
  const query = encodeURIComponent(nomeCidade);
  const resp = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${query}`,
  );
  if (!resp.ok) throw new Error("Erro IBGE");
  const data = await resp.json();
  if (!data || data.length === 0) return null;

  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const nomeNorm = norm(nomeCidade);
  const exato = data.find((m) => norm(m.nome) === nomeNorm);
  const resultado = exato || data[0];

  return {
    geocode: resultado.id,
    nome: resultado.nome,
    uf: resultado.microrregiao.mesorregiao.UF.sigla,
  };
}

function nivelLabel(nivel) {
  const map = {
    1: { texto: "Verde (Baixo)", classe: "nivel-1" },
    2: { texto: "Amarelo (Medio)", classe: "nivel-2" },
    3: { texto: "Laranja (Alto)", classe: "nivel-3" },
    4: { texto: "Vermelho (Muito Alto)", classe: "nivel-4" },
  };
  return map[nivel] || { texto: "Desconhecido", classe: "nivel-1" };
}
async function verificarRadar() {
  const inputRaw = document.getElementById("cidadeInput").value.trim();
  const anoVal = document.getElementById("anoSelect").value;
  const semanaVal = document.getElementById("semanaSelect").value;
  const [ewStart, ewEnd] = semanaVal.split("-");
  const container = document.getElementById("containerRadar");

  if (!inputRaw) return (container.innerHTML = "Digite uma cidade.");

  container.style.display = "block";
  container.innerHTML = "Processando...";

  try {
    const cidade = await buscarGeocode(inputRaw);
    if (!cidade) {
      container.innerHTML = "Cidade não encontrada.";
      return;
    }

    const proxy = "https://api.allorigins.win/raw?url=";
    const baseApi = `https://info.dengue.mat.br/api/alertcity?geocode=${cidade.geocode}&format=json&ew_start=${ewStart}&ew_end=${ewEnd}&ey_start=${anoVal}&ey_end=${anoVal}`;

    const [dadosDengue, dadosChikun] = await Promise.all([
      fetch(`${proxy}${encodeURIComponent(baseApi + "&disease=dengue")}`).then(
        (r) => r.json(),
      ),
      fetch(
        `${proxy}${encodeURIComponent(baseApi + "&disease=chikungunya")}`,
      ).then((r) => r.json()),
    ]);

    exibirResultados(cidade, dadosDengue, dadosChikun);
  } catch (error) {
    console.error(error);
    container.innerHTML = "Erro na comunicação com as APIs.";
  }
}

function exibirResultados(cidade, dengue, chikun) {
  const container = document.getElementById("containerRadar");
  const ultDengue = dengue?.[0] || { casos: 0, nivel: 1 };
  const nivel = nivelLabel(ultDengue.nivel);

  container.innerHTML = `
    <strong>${cidade.nome}/${cidade.uf}</strong><br>
    <div class="resumo-cards">
      <div class="card ${nivel.classe}">
        <strong>Dengue</strong><br>
        Casos: ${ultDengue.casos}<br>
        Status: ${nivel.texto}
      </div>
    </div>
  `;
}
async function verificarNoticia() {
  const noticia = document.getElementById("noticiaInput").value.trim();
  if (!noticia) return alert("Digite uma notícia!");

  const container = document.getElementById("containerFake");
  container.style.display = "block";
  container.innerHTML = "Analisando...";

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "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",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "user",
              content: `Você é um verificador de fatos sobre dengue. Responda se é REAL ou FAKE e explique brevemente. Notícia: "${noticia}, Tire as formatações quero um texto seco."`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1200,
        }),
      },
    );

    const data = await response.json();
    const resposta = data.choices?.[0]?.message?.content || "Sem resposta";

    container.innerHTML = resposta.replace(/\n/g, "<br>");
  } catch {
    container.innerHTML = "Erro ao consultar IA.";
  }
}

const regioes = ["Sudeste", "Sul", "Centro-Oeste", "Nordeste", "Norte"];
const incidencia = [4739.8, 3949.0, 3894.1, 600.1, 284.2];

new Chart(document.getElementById("graficoDengue"), {
  type: "bar",
  data: {
    labels: regioes,
    datasets: [
      {
        label: "Casos por 100k",
        data: incidencia,
        backgroundColor: ["red", "orange", "yellow", "blue", "green"],
      },
    ],
  },
});

document.getElementById("cidadeInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") verificarRadar();
});

document.getElementById("noticiaInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") verificarNoticia();
});
