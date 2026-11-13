/* Compras · app de pedidos de material e ordens de compra · v1.0
   Mesmo funcionamento do app da Oficina: tudo fica no celular e é enviado quando o sinal voltar. */
(function () {
  var VERSAO_APP = '1.1.0';
  var C = window.Compras, L = C.Local;
  var S = { token: null, snap: null, fila: [], view: 'carregando', pilha: [], form: null, dados: null, filtro: '', busca: '',
            online: navigator.onLine !== false, sincronizando: false, instalar: null, login: { nomes: null, msg: '', nome: '' }, fornHash: '' };
  var app = document.getElementById('app'), barra = document.getElementById('barra'), estado = document.getElementById('estado');
  var VIEWS_FORM = { novo: 1, pedido: 1 };
  var ST = { AP: 'Aguardando aprovação', COT: 'Em cotação', DIR: 'Aguardando diretoria', OKDIR: 'Compra aprovada', ENT: 'Aguardando entrega',
             PARC: 'Entrega parcial', PROB: 'Problema na entrega', FIM: 'Entregue', REP: 'Reprovado', CANC: 'Cancelado' };
  var A_RECEBER = [ST.ENT, ST.PARC, ST.PROB], FINAIS = [ST.FIM, ST.REP, ST.CANC];
  var MAX_FOTOS = 4, MAX_COT = 3;

  // ---------------- utilidades ----------------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s) { return document.querySelector(s); }
  function toast(m) { var t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3600); }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v === undefined || v === null ? '' : v).trim().replace(/[R$\s]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s); return isFinite(n) ? n : 0;
  }
  function vazio(v) { return v === '' || v === null || v === undefined; }
  function reais(v) { return (num(v)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function compacto(v) { v = num(v); return v >= 100000 ? 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + ' mil' : v >= 10000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : reais(v).replace(/,\d\d$/, ''); }
  function fmtNum(n) { return num(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); }
  function paraCampo(n) { return vazio(n) ? '' : String(n).replace('.', ','); }
  function guardarLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function dois(n) { return ('0' + n).slice(-2); }
  function agoraTexto() { var d = new Date(); return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes()); }
  function hora(ms) { var d = new Date(ms); return dois(d.getHours()) + ':' + dois(d.getMinutes()); }
  function hojeISO() { var d = new Date(); return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()); }
  function isoBR(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function diasAte(iso) { if (!iso) return null; var a = new Date(hojeISO() + 'T12:00:00'), b = new Date(iso + 'T12:00:00'); return Math.round((b - a) / 864e5); }
  function soData(t) { return String(t || '').slice(0, 10); }
  function thumb(id) { return '<a class="foto" href="https://drive.google.com/file/d/' + esc(id) + '/view" target="_blank" rel="noopener"><img alt="Foto" loading="lazy" src="https://drive.google.com/thumbnail?id=' + esc(id) + '&sz=w400" onerror="this.style.display=\'none\'"></a>'; }
  function thumbLocal(src) { return '<div class="foto pend"><img src="' + src + '" alt="Foto aguardando envio"></div>'; }
  function U() { return S.snap ? S.snap.usuario : null; }
  function P() { var u = U(); return (u && u.pode) || {}; }
  function pedidos() { return (S.snap && S.snap.pedidos) || []; }
  function acharPedido(n) { return pedidos().filter(function (p) { return p.numero === n; })[0]; }
  function aberto(p) { return FINAIS.indexOf(p.status) < 0; }
  function receber(p) { return A_RECEBER.indexOf(p.status) >= 0; }
  function atraso(p) { if (!receber(p) || !p.previsaoISO) return 0; var d = diasAte(p.previsaoISO); return d < 0 ? -d : 0; }
  function semAcento(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function clonar(x) { return JSON.parse(JSON.stringify(x)); }

  // ---------------- dados locais ----------------
  function recarregarFila() { return L.fila().then(function (f) { S.fila = f || []; }); }
  function pendentes() { return S.fila.filter(function (i) { return !i.falhou; }); }
  function falhas() { return S.fila.filter(function (i) { return i.falhou; }); }
  function salvarSnap() { return L.gravar('snap', S.snap); }
  function pedPendente(numero) { return S.fila.some(function (i) { return i.numero === numero; }); }

  function enfileirar(acao, args, extra) {
    var item = { op: C.novoCodigo(), acao: acao, args: args, criadoEm: Date.now(), seq: (S.fila.length || 0), dataTexto: agoraTexto() };
    if (extra) for (var k in extra) item[k] = extra[k];
    return L.enfileirar(item).then(recarregarFila).then(function () {
      pedirEnvioEmSegundoPlano();
      setTimeout(sincronizar, 50);
      return item;
    });
  }
  function pedirEnvioEmSegundoPlano() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) { if (reg.sync) return reg.sync.register('enviar-fila'); }).catch(function () {});
  }

  // ---------------- sincronização ----------------
  function sincronizar() {
    if (S.sincronizando || !S.token) return Promise.resolve();
    S.sincronizando = true; desenharEstado();
    return C.sincronizar().then(function (r) {
      S.online = true;
      if (r && r.snap) S.snap = r.snap;
      if (r && r.enviados) toast(r.enviados === 1 ? '1 envio feito' : r.enviados + ' envios feitos');
      if (r && r.falhas) toast('Um envio deu erro. Veja em "Envios com erro".');
    }, function (e) {
      if (e && e.rede) { S.online = false; return; }
      if (e && e.sessao) { encerrarSessao(e.message); return; }
      toast((e && e.message) || 'Não foi possível atualizar.');
    }).then(recarregarFila).then(function () {
      S.sincronizando = false;
      if (S.view === 'login') return;
      if (!VIEWS_FORM[S.view]) render();
      else if (S.view === 'pedido' && !(S.form && S.form.sujo)) { var y = window.scrollY; S.form = null; render(); window.scrollTo(0, y); }
      else desenharEstado();
    });
  }

  function desenharEstado() {
    if (!S.token || S.view === 'login') { estado.hidden = true; return; }
    estado.hidden = false;
    var p = pendentes().length, cls, txt;
    if (S.sincronizando) { cls = 'sync'; txt = 'Atualizando…'; }
    else if (!S.online) { cls = 'off'; txt = '<b>Sem internet.</b> ' + (p ? p + (p === 1 ? ' envio guardado' : ' envios guardados') + ' no celular' : 'Pode continuar usando'); }
    else { cls = ''; txt = p ? '<b>' + p + (p === 1 ? ' envio' : ' envios') + '</b> esperando' : 'Atualizado ' + (S.snap && S.snap.recebidoEm ? 'às ' + hora(S.snap.recebidoEm) : ''); }
    estado.className = 'estado ' + cls;
    estado.innerHTML = '<span class="bola" aria-hidden="true"></span><span>' + txt + '</span>' + (S.sincronizando ? '' : '<button id="btnSync">Atualizar</button>');
    var b = $('#btnSync'); if (b) b.onclick = function () { sincronizar(); };
  }

  // ---------------- navegação ----------------
  function ir(view, dados, semPilha) {
    if (!semPilha && S.view !== 'carregando' && S.view !== 'login') S.pilha.push({ view: S.view, dados: S.dados, filtro: S.filtro });
    S.form = null; S.view = view; S.dados = dados || null;
    if (view === 'lista') { S.filtro = ''; S.busca = ''; }
    render(); window.scrollTo(0, 0);
  }
  function voltar() {
    var a = S.pilha.pop() || { view: 'inicio' };
    S.form = null; S.view = a.view; S.dados = a.dados || null; S.filtro = a.filtro || '';
    render(); window.scrollTo(0, 0);
  }

  function cabecalho() {
    var u = U();
    var esq = S.view === 'inicio' || S.view === 'login' || S.view === 'carregando'
      ? '<div class="faixa" aria-hidden="true"></div><h1 class="marca">Compras</h1>'
      : '<button class="voltar" id="btnVoltar" aria-label="Voltar">‹ Voltar</button>';
    var dir = u && S.view !== 'login' ? '<div class="quem"><b>' + esc(u.nome) + '</b>' + esc(u.funcao) + ' · <button id="btnSair">Sair</button></div>' : '';
    barra.innerHTML = esq + dir;
    var b = $('#btnVoltar'); if (b) b.onclick = voltar;
    var s = $('#btnSair'); if (s) s.onclick = sair;
    desenharEstado();
  }

  function render() {
    if (VIEWS_FORM[S.view]) salvarCamposDaTela();
    cabecalho();
    var f = { login: vLogin, inicio: vInicio, novo: vNovo, lista: vLista, pedido: vPedido, painel: vPainel, envios: vEnvios,
              carregando: function () { return '<div class="carregando">Carregando…</div>'; } }[S.view] || vInicio;
    app.innerHTML = f();
    listaFornecedores();
    ligar();
  }

  function listaFornecedores() {
    var l = (S.snap && S.snap.fornecedores) || [], hsh = l.join('|');
    if (hsh === S.fornHash) return;
    S.fornHash = hsh;
    document.getElementById('listaForn').innerHTML = l.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  // ---------------- sessão ----------------
  function iniciar() {
    Promise.all([L.ler('token'), L.ler('snap'), recarregarFila()]).then(function (r) {
      S.token = r[0] || null; S.snap = r[1] || null;
      if (!S.token) return mostrarLogin();
      if (S.snap) { S.view = 'inicio'; render(); }
      else { S.view = 'carregando'; render(); }
      sincronizar().then(function () { if (!S.snap && S.token) { S.view = 'carregando'; app.innerHTML = '<div class="card vazio"><b>Sem internet</b><span>Conecte o celular uma vez para baixar a lista de obras.</span><button class="btn sec" id="btnTentar">Tentar de novo</button></div>'; var t = $('#btnTentar'); if (t) t.onclick = function () { sincronizar(); }; } });
    }).catch(function () { app.innerHTML = '<div class="card vazio"><b>Este celular não permite guardar dados</b><span>Saia do modo anônimo ou libere o armazenamento do navegador.</span></div>'; });
  }

  function mostrarLogin(msg) {
    S.view = 'login'; S.pilha = []; S.login.msg = msg || ''; render();
    L.ler('nomes').then(function (n) { if (n && !S.login.nomes) { S.login.nomes = n; if (S.view === 'login') render(); } });
    C.chamar('listarNomes', []).then(function (n) {
      S.login.nomes = n; L.gravar('nomes', n); if (S.view === 'login') render();
    }, function (e) {
      if (e.rede && !S.login.nomes) S.login.msg = 'Sem internet. Para entrar pela primeira vez, o celular precisa estar conectado.';
      else if (!e.rede) S.login.msg = e.message;
      if (S.view === 'login') render();
    });
  }

  function encerrarSessao(msg) {
    S.token = null; S.snap = null;
    L.apagar('token').then(function () { return L.apagar('snap'); }).then(function () { mostrarLogin(msg); });
  }

  function sair() {
    if (pendentes().length || falhas().length) {
      toast('Ainda há envios guardados neste celular. Conecte à internet e toque em Atualizar antes de sair.');
      return;
    }
    var t = S.token;
    C.chamar('sair', [], t).catch(function () {});
    encerrarSessao();
  }

  // ---------------- telas ----------------
  function vLogin() {
    var d = S.login, nomes = d.nomes;
    return '<div class="card"><h2>Entrar</h2><p class="hint">Escolha o seu nome e digite o seu PIN. O celular fica conectado e funciona mesmo sem internet.</p>' +
      '<label>Seu nome<select id="lNome">' + (nomes ? '<option value="">Escolha…</option>' + nomes.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') : '<option>Carregando…</option>') + '</select></label>' +
      '<label>PIN<input id="lPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="••••"></label>' +
      (d.msg ? '<p class="erro">' + esc(d.msg) + '</p>' : '') +
      '<button class="btn" id="btnEntrar"' + (nomes ? '' : ' disabled') + '>Entrar</button>' +
      '<p class="hint">Não está na lista ou esqueceu o PIN? Fale com o escritório.</p></div>' +
      (C && !window.COMPRAS_API ? '<p class="aviso">O endereço da planilha ainda não foi configurado neste app.</p>' : '') +
      '<p class="rodape">Compras · versão ' + VERSAO_APP + '</p>';
  }

  function contagens() {
    var u = U() || {}, l = pedidos(), c = { ap: 0, cot: 0, dir: 0, rec: 0, atr: 0, meus: 0 };
    l.forEach(function (p) {
      if (p.status === ST.AP) c.ap++;
      if (p.status === ST.COT || p.status === ST.OKDIR) c.cot++;
      if (p.status === ST.DIR) c.dir++;
      if (receber(p)) { c.rec++; if (atraso(p)) c.atr++; }
      if (p.solicitante === u.nome && aberto(p)) c.meus++;
    });
    c.meus += S.fila.filter(function (i) { return i.acao === 'novoPedido'; }).length;
    return c;
  }

  function vInicio() {
    var u = U(); if (!u) return '<div class="carregando">Carregando…</div>';
    var p = P(), c = contagens();
    var itens = ['<button class="item-menu prim" data-ir="novo"><span><span class="t">Novo pedido</span><span class="s">Pedir material para a obra</span></span></button>'];
    if (p.aprovar) itens.push(item('aprovar', 'Aprovar pedidos', 'Pedidos das obras esperando o escritório', c.ap, c.ap > 0));
    if (p.comprar) itens.push(item('cotar', 'Cotações e OC', 'Cotar, emitir a OC e acompanhar entregas', c.cot, false));
    if (p.diretoria) itens.push(item('diretoria', 'Aprovar compras', 'Acima da alçada de ' + compacto(S.snap.alcada), c.dir, c.dir > 0));
    itens.push(item('receber', 'Receber material', 'Confirmar o que chegou na obra', c.rec, c.atr > 0));
    if (p.verTodos) itens.push(item('todos', 'Todos os pedidos', 'Buscar por obra, item, fornecedor ou OC', null, false));
    if (p.painel) itens.push('<button class="item-menu" data-ir="painel"><span><span class="t">Painel</span><span class="s">Atrasos, valores por obra e tempos</span></span></button>');
    itens.push(item('meus', 'Meus pedidos', 'O que eu pedi e o andamento', c.meus, false));
    var f = falhas().length, pe = pendentes().length;
    var alerta = f ? '<button class="alerta-fila" data-ir="envios">' + f + (f === 1 ? ' envio deu erro' : ' envios deram erro') + '. Toque para ver.</button>'
      : (pe && !S.online ? '<button class="alerta-fila leve" data-ir="envios">' + pe + (pe === 1 ? ' envio guardado' : ' envios guardados') + ' no celular. Serão enviados quando o sinal voltar.</button>' : '');
    var tiles = p.verTodos
      ? tile(c.ap, 'A aprovar', c.ap > 0) + tile(c.cot + c.dir, 'Em compra', false) + tile(c.atr, 'Entregas atrasadas', c.atr > 0)
      : tile(c.meus, 'Meus em aberto', false) + tile(c.rec, 'A receber', false) + tile(c.atr, 'Atrasadas', c.atr > 0);
    return alerta + '<div class="tiles">' + tiles + '</div>' +
      '<div class="menu">' + itens.join('') + '</div>' + blocoInstalar() +
      '<p class="rodape">Compras · versão ' + VERSAO_APP + (S.snap && S.snap.sincronizadoEm ? ' · dados de ' + esc(S.snap.sincronizadoEm) : '') + '</p>';
    function item(tipo, t, s, n, alerta) {
      return '<button class="item-menu" data-ir="lista" data-tipo="' + tipo + '"><span><span class="t">' + t + '</span><span class="s">' + s + '</span></span>' + (n === null || n === undefined ? '' : '<span class="n' + (alerta ? ' alerta' : '') + '">' + n + '</span>') + '</button>';
    }
    function tile(n, l, ruim) { return '<div class="tile' + (ruim ? ' bad' : '') + '"><span class="n">' + (n || 0) + '</span><span class="l">' + l + '</span></div>'; }
  }

  function blocoInstalar() {
    var instalado = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (instalado) return '';
    if (S.instalar) return '<div class="instalar"><b>Instale o app neste celular</b><span>Fica um ícone na tela e ele abre mesmo sem internet.</span><button class="btn" id="btnInstalar">Instalar</button></div>';
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return '<div class="instalar"><b>Instale o app neste iPhone</b><span>No Safari, toque em Compartilhar (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.</span></div>';
    return '';
  }

  // ----- novo pedido -----
  function itemVazio() { return { desc: '', qtd: '', un: 'un' }; }
  function editorItens(itens, pf) {
    var un = (S.snap && S.snap.unidades) || ['un'];
    return itens.map(function (it, i) {
      return '<div class="item-ed"><span class="n">Item ' + (i + 1) + '</span>' +
        '<input class="d" id="' + pf + 'd' + i + '" aria-label="Descrição do item ' + (i + 1) + '" placeholder="O que é. Ex.: cimento CP-II 50 kg" value="' + esc(it.desc) + '">' +
        '<input id="' + pf + 'q' + i + '" inputmode="decimal" aria-label="Quantidade do item ' + (i + 1) + '" placeholder="Quantidade" value="' + esc(it.qtd) + '">' +
        '<select id="' + pf + 'u' + i + '" aria-label="Unidade do item ' + (i + 1) + '">' + un.map(function (u) { return '<option' + (u === it.un ? ' selected' : '') + '>' + esc(u) + '</option>'; }).join('') + '</select>' +
        '<button class="x" data-tiraritem="' + i + '" aria-label="Tirar item ' + (i + 1) + '"' + (itens.length === 1 ? ' disabled style="opacity:.35"' : '') + '>×</button></div>';
    }).join('') + '<button class="mais" id="maisItem">+ Adicionar item</button>';
  }
  function lerItens(pf, itens) {
    itens.forEach(function (it, i) {
      var d = $('#' + pf + 'd' + i), q = $('#' + pf + 'q' + i), u = $('#' + pf + 'u' + i);
      if (d) it.desc = d.value; if (q) it.qtd = q.value; if (u) it.un = u.value;
    });
  }
  function validarItens(itens) {
    var bons = [];
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i], d = String(it.desc || '').trim(), q = num(it.qtd);
      if (!d && vazio(String(it.qtd).trim())) continue;
      if (!d) return { erro: 'Escreva a descrição do item ' + (i + 1) + '.' };
      if (!(q > 0)) return { erro: 'Informe a quantidade do item ' + (i + 1) + ' (' + d + ').' };
      bons.push({ desc: d, qtd: q, un: it.un || 'un' });
    }
    if (!bons.length) return { erro: 'Inclua pelo menos um item.' };
    return { itens: bons };
  }

  function maquinas() { return (S.snap && S.snap.maquinas) || []; }
  function acharMaquina(t) {
    var n = semAcento(t);
    return maquinas().filter(function (m) { return semAcento(m.apelido) === n; })[0] || null;
  }
  function vNovo() {
    var obras = (S.snap && S.snap.obras) || [];
    var f = S.form || (S.form = { obra: lerLS('compras_obra') || '', aplicacao: '', maquina: '', urgencia: 'Normal', precisaAte: '', itens: [itemVazio()], observacao: '', fotos: [] });
    if (f.obra && !obras.some(function (o) { return o.obra === f.obra; })) f.obra = '';
    return '<div class="card"><h2>Novo pedido</h2>' +
      (!S.online ? '<p class="aviso">Sem internet: o pedido fica guardado e é enviado sozinho quando o sinal voltar.</p>' : '') +
      '<label>Obra<select id="nObra"><option value="">Escolha a obra…</option>' + obras.map(function (o) { return '<option' + (o.obra === f.obra ? ' selected' : '') + '>' + esc(o.obra) + '</option>'; }).join('') + '</select></label>' +
      '<label>Onde vai ser usado <small>etapa, serviço ou máquina</small><input id="nApl" value="' + esc(f.aplicacao) + '" placeholder="Ex.: drenagem quadra 3, escavadeira 320"></label>' +
      (maquinas().length ? '<label>Máquina <small>só se o material for para uma máquina (peça, filtro, pneu)</small><input id="nMaq" list="listaMaq" autocomplete="off" value="' + esc(f.maquina || '') + '" placeholder="Digite o apelido">' +
        '<datalist id="listaMaq">' + maquinas().map(function (m) { return '<option value="' + esc(m.apelido) + '">' + esc(m.descricao) + '</option>'; }).join('') + '</datalist></label>' : '') +
      '<div class="campo">Itens<div class="lista">' + editorItens(f.itens, 'n') + '</div></div>' +
      '<div class="linha"><label>Precisa até <small>se tiver data</small><input id="nAte" type="date" min="' + hojeISO() + '" value="' + esc(f.precisaAte) + '"></label>' +
      '<div class="campo">Urgência<div class="seg">' + ['Normal', 'Urgente'].map(function (x) { return '<button data-urg="' + x + '" aria-pressed="' + (f.urgencia === x) + '">' + x + '</button>'; }).join('') + '</div></div></div>' +
      '<label>Observação <small>marca, medida, onde entregar. Pode usar o microfone do teclado.</small><textarea id="nObs" placeholder="Ex.: mesma marca da última compra, entregar no canteiro da rua B">' + esc(f.observacao) + '</textarea></label>' +
      '<div class="campo">Fotos <small>até ' + MAX_FOTOS + ': do material, da peça ou da especificação</small><div class="fotos">' + f.fotos.map(function (src, i) { return '<div class="foto"><img src="' + src + '" alt="Foto ' + (i + 1) + '"><button data-tirar="' + i + '" aria-label="Tirar foto">×</button></div>'; }).join('') +
        (f.fotos.length < MAX_FOTOS ? '<button class="add-foto" id="addFoto"><b>+</b>Foto</button>' : '') + '</div></div>' +
      '<p class="erro" id="nErro" hidden></p>' +
      '<button class="btn" id="btnEnviar">' + (S.online ? 'Enviar pedido' : 'Guardar pedido') + '</button></div>';
  }

  // ----- listas -----
  function tiposLista() {
    var u = U() || {};
    return {
      meus: { titulo: 'Meus pedidos', base: function (p) { return p.solicitante === u.nome; }, chips: [['abertos', 'Em aberto'], ['fechados', 'Encerrados']], pend: true },
      aprovar: { titulo: 'Aprovar pedidos', hint: 'Urgentes primeiro, depois os mais antigos. Abra o pedido para aprovar ou reprovar.', base: function (p) { return p.status === ST.AP; }, ordem: 'antigos' },
      cotar: { titulo: 'Cotações e OC', base: function (p) { return [ST.COT, ST.OKDIR, ST.DIR].indexOf(p.status) >= 0 || receber(p); },
               chips: [['cotar', 'Para cotar'], ['okdir', 'Liberadas para OC'], ['dir', 'Na diretoria'], ['entrega', 'Aguardando entrega']], ordem: 'antigos' },
      diretoria: { titulo: 'Aprovar compras', hint: 'Compras acima de ' + reais(S.snap.alcada) + '. Abra para ver os orçamentos.', base: function (p) { return p.status === ST.DIR; }, ordem: 'antigos' },
      receber: { titulo: 'Receber material', hint: 'Quando o material chegar na obra, abra o pedido e confirme. Atrasadas primeiro.', base: receber, ordem: 'entrega' },
      todos: { titulo: 'Todos os pedidos', base: function () { return true; }, chips: [['abertos', 'Em aberto'], ['entregues', 'Entregues'], ['cancelados', 'Reprovados e cancelados']], busca: true }
    };
  }
  var FILTROS = {
    abertos: aberto, fechados: function (p) { return !aberto(p); }, cotar: function (p) { return p.status === ST.COT; },
    okdir: function (p) { return p.status === ST.OKDIR; }, dir: function (p) { return p.status === ST.DIR; }, entrega: receber,
    entregues: function (p) { return p.status === ST.FIM; }, cancelados: function (p) { return p.status === ST.REP || p.status === ST.CANC; }
  };

  function filtrarBusca(l, q) {
    var n = semAcento(q.trim()); if (!n) return l;
    return l.filter(function (p) {
      return semAcento([p.numero, p.oc, p.obra, p.fornecedor, p.solicitante, p.aplicacao, p.maquina, p.os, (p.itens || []).map(function (i) { return i.desc; }).join(' ')].join(' ')).indexOf(n) >= 0;
    });
  }

  function vLista() {
    var tipo = (S.dados && S.dados.tipo) || 'meus', cfg = tiposLista()[tipo];
    var base = pedidos().filter(cfg.base);
    if (cfg.chips && !S.filtro) S.filtro = cfg.chips[0][0];
    var vis = cfg.chips ? base.filter(FILTROS[S.filtro]) : base;
    if (cfg.ordem === 'antigos') vis.sort(function (a, b) { return (a.urgencia === 'Urgente' ? 0 : 1) - (b.urgencia === 'Urgente' ? 0 : 1) || a.numero.localeCompare(b.numero); });
    if (cfg.ordem === 'entrega') vis.sort(function (a, b) { return atraso(b) - atraso(a) || String(a.previsaoISO || '9').localeCompare(String(b.previsaoISO || '9')); });
    var novos = cfg.pend && S.filtro === 'abertos' ? pedidosNaFila() : [];
    return '<h2>' + cfg.titulo + '</h2>' + (cfg.hint ? '<p class="hint">' + cfg.hint + '</p>' : '') +
      (cfg.chips ? '<div class="chips">' + cfg.chips.map(function (c) { return '<button class="chip" data-filtro="' + c[0] + '" aria-pressed="' + (S.filtro === c[0]) + '">' + c[1] + ' (' + base.filter(FILTROS[c[0]]).length + ')</button>'; }).join('') + '</div>' : '') +
      (cfg.busca ? '<input id="busca" type="search" placeholder="Buscar: obra, item, fornecedor, RC ou OC" value="' + esc(S.busca) + '">' : '') +
      '<div id="resLista">' + listaHtml(novos, filtrarBusca(vis, S.busca)) + '</div>';
  }

  function listaHtml(novos, vis) {
    if (!novos.length && !vis.length) return '<div class="card vazio"><b>Nada por aqui</b><span>' + (S.busca ? 'Nenhum pedido com esse texto.' : 'Nenhum pedido nesta situação.') + '</span></div>';
    return '<div class="lista">' + novos.map(cartaoNaFila).join('') + vis.map(cartao).join('') + '</div>';
  }

  function resumoItens(itens, max) {
    max = max || 3;
    var t = (itens || []).slice(0, max).map(function (i) { return i.desc + ' (' + fmtNum(i.qtd) + ' ' + i.un + ')'; }).join(', ');
    return t + ((itens || []).length > max ? ' e mais ' + (itens.length - max) : '');
  }
  function classePed(p) { return p.status === ST.FIM ? 'ok' : (atraso(p) ? 'parada' : (p.urgencia === 'Urgente' && aberto(p) ? 'urgente' : (p.status === ST.AP || p.status === ST.DIR ? 'alta' : ''))); }
  function pillStatus(s) {
    var c = { 'Aguardando aprovação': 'warn', 'Em cotação': 'info', 'Aguardando diretoria': 'warn', 'Compra aprovada': 'info', 'Aguardando entrega': 'info',
              'Entrega parcial': 'warn', 'Problema na entrega': 'bad', 'Entregue': 'ok', 'Reprovado': 'bad', 'Cancelado': '' }[s] || '';
    return '<span class="pill ' + c + '">' + esc(s) + '</span>';
  }
  function linhaEntrega(p) {
    if (receber(p) && p.previsaoISO) {
      var a = atraso(p), d = diasAte(p.previsaoISO);
      return a ? '<span class="meta" style="color:var(--bad);font-weight:600">Entrega atrasada ' + a + ' dia' + (a === 1 ? '' : 's') + ' (previsão ' + esc(p.previsao) + ')</span>'
        : '<span class="meta">Entrega prevista ' + esc(p.previsao) + (d === 0 ? ' (hoje)' : d === 1 ? ' (amanhã)' : '') + '</span>';
    }
    if (aberto(p) && !p.oc && p.precisaAteISO) {
      var r = diasAte(p.precisaAteISO);
      return '<span class="meta"' + (r !== null && r <= 2 ? ' style="color:var(--bad);font-weight:600"' : '') + '>Precisa até ' + esc(p.precisaAte) + '</span>';
    }
    return '';
  }
  function cartao(p) {
    return '<button class="reg ' + classePed(p) + '" data-ped="' + esc(p.numero) + '"><span class="tarja"></span><span class="corpo">' +
      '<span class="topo"><span class="maq">' + esc(p.obra) + '</span>' + pillStatus(p.status) + '</span>' +
      '<span class="meta">' + esc(p.numero) + (p.oc ? ' · ' + esc(p.oc) : '') + ' · ' + esc(soData(p.pedidoEm)) + ' · ' + esc(p.solicitante) +
        (p.urgencia === 'Urgente' && aberto(p) ? ' · <b style="color:var(--bad)">URGENTE</b>' : '') + (pedPendente(p.numero) ? ' · <b style="color:var(--warn)">alteração aguardando envio</b>' : '') + '</span>' +
      '<span class="desc">' + esc(resumoItens(p.itens)) + '</span>' +
      (p.fornecedor ? '<span class="meta">' + esc(p.fornecedor) + (vazio(p.valorTotal) ? '' : ' · <b style="color:var(--ink)">' + reais(p.valorTotal) + '</b>') + '</span>' : '') +
      linhaEntrega(p) + '</span></button>';
  }
  function pedidosNaFila() {
    return S.fila.filter(function (i) { return i.acao === 'novoPedido'; }).reverse();
  }
  function cartaoNaFila(i) {
    var d = i.args[0];
    return '<div class="reg alta"><span class="tarja"></span><div class="corpo"><div class="topo"><span class="maq">' + esc(d.obra) + '</span>' +
      (i.falhou ? '<span class="pill bad">Erro no envio</span>' : '<span class="pill warn">Aguardando envio</span>') + '</div>' +
      '<div class="meta">' + esc(i.dataTexto) + ' · sem número ainda</div><div class="desc">' + esc(resumoItens(d.itens)) + '</div>' +
      ((d.fotos || []).length ? '<div class="fotos">' + d.fotos.map(function (f) { return thumbLocal(f.base64); }).join('') + '</div>' : '') +
      (i.falhou ? '<div class="erro">' + esc(i.erro) + '</div>' : '') + '</div></div>';
  }

  // ----- detalhe do pedido -----
  function cotParaForm(c) {
    return { fornecedor: c.fornecedor || '', precos: (c.precos || []).map(paraCampo), frete: paraCampo(c.frete), prazo: c.prazo || '', pagamento: c.pagamento || '', obs: c.obs || '' };
  }
  function cotVazia(n) { var p = []; for (var i = 0; i < n; i++) p.push(''); return { fornecedor: '', precos: p, frete: '', prazo: '', pagamento: '', obs: '' }; }
  function totalCot(c, itens) {
    var t = 0; itens.forEach(function (it, i) { t += num(c.precos[i]) * num(it.qtd); });
    return Math.round((t + num(c.frete)) * 100) / 100;
  }
  function faltaPreco(c, itens) { return itens.filter(function (_, i) { return !(num(c.precos[i]) > 0); }).length; }

  function formPedido(p) {
    if (S.form && S.form.numero === p.numero) return S.form;
    var n = (p.itens || []).length, obra = ((S.snap.obras || []).filter(function (o) { return o.obra === p.obra; })[0]) || {};
    var cots = (p.cotacoes || []).map(cotParaForm);
    if (p.status === ST.COT && !cots.length) cots.push(cotVazia(n));
    var venc = p.vencedora === undefined ? -1 : p.vencedora;
    if (cots.length === 1 && venc < 0) venc = 0;
    var vq = (p.cotacoes || [])[p.vencedora] || {};
    S.form = { numero: p.numero, abrir: {}, rec: '', itens: clonar(p.itens || []).map(function (i) { i.qtd = paraCampo(i.qtd); return i; }),
      cotacoes: cots, vencedora: venc, justificativa: p.justificativa || '', obsEsc: '',
      empresa: p.empresa || '', previsao: p.previsaoISO || '', pagamento: p.pagamento || vq.pagamento || '', local: p.local || (obra.endereco ? p.obra + ' · ' + obra.endereco : ''), obsForn: p.obsFornecedor || '',
      obsRec: '', fotosRec: [], novaPrev: '', motivoPrev: '', motivoRep: '', motivoDir: '', motivoCanc: '' };
    return S.form;
  }

  function podeCancelar(p) {
    var u = U(), pp = P();
    if (!aberto(p)) return false;
    return pp.aprovar || pp.comprar || pp.diretoria || (p.solicitante === u.nome && p.status === ST.AP);
  }

  function vPedido() {
    var p = acharPedido(S.dados && S.dados.numero);
    if (!p) return '<div class="card vazio"><b>Pedido não encontrado neste celular</b><span>Toque em Atualizar com internet.</span></div>';
    var f = formPedido(p), pp = P(), u = U();
    var html = cardResumo(p);
    if (p.status === ST.AP && pp.aprovar) html += cardAprovar(p, f);
    else if (p.status === ST.AP && pp.comprar) html += cardEditarItens(p, f, 'Aguardando a aprovação do escritório. Se precisar, corrija os itens.');
    if (p.status === ST.COT && pp.comprar) html += cardCotacao(p, f);
    if ((p.cotacoes || []).length && !(p.status === ST.COT && pp.comprar) && (pp.verTodos)) html += cardCotacaoLeitura(p);
    if (p.status === ST.DIR && pp.diretoria) html += cardDiretoria(p, f);
    if (p.status === ST.OKDIR && pp.comprar) html += cardEmitir(p, f);
    if (receber(p)) html += cardReceber(p, f, pp);
    if (podeCancelar(p)) html += cardCancelar(p, f, pp, u);
    return html;
  }

  function cardResumo(p) {
    var oc = !!p.oc && p.vencedora >= 0 && p.cotacoes && p.cotacoes[p.vencedora];
    var q = oc ? p.cotacoes[p.vencedora] : null;
    var ruim = p.status === ST.REP || p.status === ST.CANC || p.status === ST.PROB;
    var a = atraso(p);
    return '<div class="card"><div class="reg ' + classePed(p) + '" style="border:0;padding:0"><span class="tarja"></span><div class="corpo">' +
      '<div class="topo"><span class="maq">' + esc(p.obra) + '</span>' + pillStatus(p.status) + '</div>' +
      '<div class="meta">' + esc(p.numero) + (p.oc ? ' · <b style="color:var(--ink)">' + esc(p.oc) + '</b>' : '') + ' · pedido em ' + esc(p.pedidoEm) + ' por ' + esc(p.solicitante) + '</div></div></div>' +
      (pedPendente(p.numero) ? '<p class="aviso">Há alterações deste pedido guardadas no celular, aguardando envio.</p>' : '') +
      (p.motivo ? '<p class="aviso"' + (ruim ? ' style="background:var(--bad-bg);color:var(--bad)"' : '') + '>' + esc(p.motivo) + '</p>' : '') +
      (a ? '<p class="aviso" style="background:var(--bad-bg);color:var(--bad)">Entrega atrasada ' + a + ' dia' + (a === 1 ? '' : 's') + '. Previsão era ' + esc(p.previsao) + '.</p>' : '') +
      '<div class="kv">' + kv('Empresa', p.empresa) + kv('Onde vai ser usado', p.aplicacao || '—') +
        (p.os ? kv('OS da oficina', p.os) : '') + (p.maquina ? kv('Máquina', p.maquina) : '') +
        kv('Precisa até', p.precisaAte || '—') + kv('Urgência', p.urgencia, p.urgencia === 'Urgente' && aberto(p) ? 'color:var(--bad)' : '') +
        (p.fornecedor ? kv('Fornecedor', p.fornecedor) + kv('Valor', vazio(p.valorTotal) ? '—' : reais(p.valorTotal)) : '') +
        (p.oc ? kv('Previsão de entrega', p.previsao || '—', a ? 'color:var(--bad)' : '') + kv('Pagamento', p.pagamento || '—') : '') + '</div>' +
      '<div class="tabela"><table><thead><tr><th class="num">Qtd</th><th>Un</th><th>Item</th>' + (q ? '<th class="num">Unit.</th><th class="num">Total</th>' : '') + '</tr></thead><tbody>' +
        (p.itens || []).map(function (it, i) {
          return '<tr><td class="num">' + fmtNum(it.qtd) + '</td><td>' + esc(it.un) + '</td><td>' + esc(it.desc) + '</td>' +
            (q ? '<td class="num">' + reais(q.precos[i]) + '</td><td class="num">' + reais(num(q.precos[i]) * num(it.qtd)) + '</td>' : '') + '</tr>';
        }).join('') +
        (q && num(q.frete) ? '<tr><td></td><td></td><td>Frete</td><td></td><td class="num">' + reais(q.frete) + '</td></tr>' : '') +
        (q ? '<tr><td></td><td></td><td><b>Total</b></td><td></td><td class="num"><b>' + reais(p.valorTotal) + '</b></td></tr>' : '') +
      '</tbody></table></div>' +
      (p.observacao ? '<div class="campo">Observação da ' + (p.os ? 'oficina' : 'obra') + '<div class="bloco">' + esc(p.observacao) + '</div></div>' : '') +
      (p.obsEscritorio ? '<div class="campo">Observação do escritório<div class="bloco">' + esc(p.obsEscritorio) + '</div></div>' : '') +
      ((p.fotos || []).length ? '<div class="fotos">' + p.fotos.map(thumb).join('') + '</div>' : '') +
      (p.obsRecebimento ? '<div class="campo">Recebimento<div class="bloco">' + esc(p.obsRecebimento) + '</div></div>' : '') +
      ((p.fotosRecebimento || []).length ? '<div class="fotos">' + p.fotosRecebimento.map(thumb).join('') + '</div>' : '') +
      blocoPdfs(p) +
      '<div class="campo">Andamento' + trilha(p) + '</div>' +
      '<p class="hint">Última atualização: ' + esc(p.atualizado) + (p.atualizadoPor ? ' por ' + esc(p.atualizadoPor) : '') + '</p></div>';
    function kv(l, v, st) { return '<div><span class="l">' + l + '</span><span class="v"' + (st ? ' style="' + st + '"' : '') + '>' + esc(v) + '</span></div>'; }
  }

  function blocoPdfs(p) {
    var pp = P(), u = U(), meu = p.solicitante === u.nome;
    if (!pp.verTodos && !meu) return '';
    var temReq = [ST.AP, ST.REP].indexOf(p.status) < 0 && p.aprovadoPor, links = [];
    if (p.pdfReq) links.push('<a href="' + esc(p.pdfReq) + '" target="_blank" rel="noopener">Requisição · PDF</a>');
    if (p.pdfOC) links.push('<a href="' + esc(p.pdfOC) + '" target="_blank" rel="noopener">' + esc(p.oc) + ' · PDF</a>');
    var gerar = [];
    if (temReq) gerar.push('<button class="oculto-link" data-pdf="req">' + (p.pdfReq ? 'Gerar a requisição de novo' : 'Gerar a requisição em PDF') + '</button>');
    if (p.oc && p.oc.indexOf('OC-') === 0 && pp.verTodos) gerar.push('<button class="oculto-link" data-pdf="oc">' + (p.pdfOC ? 'Gerar a OC de novo' : 'Gerar a OC em PDF') + '</button>');
    if (!links.length && !gerar.length) return '';
    return '<div class="campo">Documentos' + (links.length ? '<div class="pdfs">' + links.join('') + '</div>' : '') + gerar.join('') + '</div>';
  }

  function trilha(p) {
    var passos = [];
    passos.push(['feito', 'Pedido feito', p.pedidoEm + ' · ' + p.solicitante]);
    if (p.status === ST.REP) { passos.push(['ruim', 'Reprovado', p.motivo]); return montar(); }
    if (p.aprovadoPor) passos.push(['feito', 'Aprovado pelo escritório', p.aprovadoEm + ' · ' + p.aprovadoPor]);
    else if (p.status === ST.AP) passos.push(['agora', 'Aguardando aprovação do escritório', '']);
    if (p.status === ST.COT) passos.push(['agora', 'Em cotação', p.comprador ? 'Comprador: ' + p.comprador : '']);
    else if (p.comprador && p.fornecedor) passos.push(['feito', 'Cotado', (p.cotacoes || []).length + ' orçamento(s) · ' + p.comprador]);
    if (p.status === ST.DIR) passos.push(['agora', 'Aguardando a diretoria', reais(p.valorTotal)]);
    if (p.diretoria) passos.push(['feito', 'Aprovado pela diretoria', p.diretoriaEm + ' · ' + p.diretoria]);
    if (p.status === ST.OKDIR) passos.push(['agora', 'Aguardando o comprador emitir a OC', '']);
    if (p.oc) passos.push(['feito', 'OC emitida · ' + p.oc, p.ocEm + ' · ' + p.fornecedor]);
    if (receber(p)) passos.push([atraso(p) ? 'ruim' : 'agora', p.status === ST.ENT ? 'Aguardando entrega' : p.status, 'Previsão ' + (p.previsao || '—')]);
    if (p.status === ST.FIM) passos.push(['feito', 'Entregue', p.recebidoEm + ' · ' + p.recebidoPor]);
    if (p.status === ST.CANC) passos.push(['ruim', 'Cancelado', p.motivo]);
    return montar();
    function montar() { return '<div class="trilha">' + passos.map(function (x) { return '<div class="' + x[0] + '"><b>' + esc(x[1]) + '</b>' + (x[2] ? '<span>' + esc(x[2]) + '</span>' : '') + '</div>'; }).join('') + '</div>'; }
  }

  function cardAprovar(p, f) {
    return '<div class="card"><h3>Aprovação do escritório</h3>' +
      '<p class="hint">Confira com o orçamento da obra. Ao aprovar, o app gera a requisição em PDF e avisa o comprador.</p>' +
      (f.abrir.itens ? '<div class="campo">Corrigir itens<div class="lista">' + editorItens(f.itens, 'e') + '</div></div>' : '<button class="oculto-link" data-abrir="itens">Corrigir quantidades ou itens antes de aprovar</button>') +
      '<label>Observação para o comprador <small>opcional</small><input id="aObs" value="' + esc(f.obsEsc) + '" placeholder="Ex.: comprar junto com o pedido da quadra 4"></label>' +
      '<p class="erro" id="aErro" hidden></p>' +
      '<div class="acoes"><button class="btn" id="btnAprovar">Aprovar</button><button class="btn perigo" data-abrir="reprovar">Reprovar</button></div>' +
      (f.abrir.reprovar ? '<div class="campo"><label>Por que reprovar?<input id="rMot" value="' + esc(f.motivoRep) + '" placeholder="Ex.: fora do orçamento, já tem no almoxarifado"></label><button class="btn perigo" id="btnReprovar">Confirmar reprovação</button></div>' : '') + '</div>';
  }

  function cardEditarItens(p, f, hint) {
    return '<div class="card"><h3>Itens</h3><p class="hint">' + hint + '</p>' +
      (f.abrir.itens ? '<div class="lista">' + editorItens(f.itens, 'e') + '</div><p class="erro" id="eErro" hidden></p><button class="btn sec" id="btnSalvarItens">Salvar itens</button>'
        : '<button class="oculto-link" data-abrir="itens">Corrigir itens</button>') + '</div>';
  }

  function cardCotacao(p, f) {
    var itens = p.itens || [], alc = S.snap.alcada;
    var html = '<div class="card"><h3>Cotação</h3><p class="hint">Lance até ' + MAX_COT + ' orçamentos e escolha o vencedor. Acima de ' + reais(alc) + ' a compra vai para a diretoria.</p>' +
      (f.abrir.itens ? '<div class="campo">Corrigir itens<div class="lista">' + editorItens(f.itens, 'e') + '</div><p class="erro" id="eErro" hidden></p><button class="btn sec" id="btnSalvarItens">Salvar itens</button></div>'
        : '<button class="oculto-link" data-abrir="itens">Corrigir itens do pedido</button>');
    html += f.cotacoes.map(function (c, k) {
      var venc = f.vencedora === k;
      return '<div class="cot' + (venc ? ' venc' : '') + '" id="cot' + k + '"><div class="cab"><b>Orçamento ' + (k + 1) + '</b><button class="escolher" data-venc="' + k + '">' + (venc ? '✓ Escolhido' : 'Escolher este') + '</button></div>' +
        '<label>Fornecedor<input id="c' + k + 'f" list="listaForn" value="' + esc(c.fornecedor) + '" placeholder="Nome do fornecedor" autocomplete="off"></label>' +
        '<div class="campo">Preço unitário (R$)' + itens.map(function (it, i) {
          return '<div class="preco"><span>' + esc(it.desc) + '<small>' + fmtNum(it.qtd) + ' ' + esc(it.un) + '</small></span><input id="c' + k + 'p' + i + '" inputmode="decimal" placeholder="0,00" aria-label="Preço unitário de ' + esc(it.desc) + '" value="' + esc(c.precos[i]) + '" data-calc></div>';
        }).join('') + '</div>' +
        '<div class="linha"><label>Frete (R$)<input id="c' + k + 'fr" inputmode="decimal" placeholder="0,00" value="' + esc(c.frete) + '" data-calc></label>' +
        '<label>Prazo de entrega<input id="c' + k + 'pz" placeholder="Ex.: 3 dias" value="' + esc(c.prazo) + '"></label></div>' +
        '<label>Condição de pagamento<input id="c' + k + 'pg" placeholder="Ex.: 28 dias boleto" value="' + esc(c.pagamento) + '"></label>' +
        '<div class="tot"><span>Total</span><span id="c' + k + 'tot">' + reais(totalCot(c, itens)) + '</span></div>' +
        (f.cotacoes.length > 1 ? '<button class="oculto-link" data-tirarcot="' + k + '">Tirar este orçamento</button>' : '') + '</div>';
    }).join('');
    if (f.cotacoes.length < MAX_COT) html += '<button class="mais" id="maisCot">+ Outro orçamento</button>';
    html += '<div class="resumo" id="resumoCot"></div>' +
      '<label>Por que este fornecedor? <small>se não for o mais barato</small><input id="cJust" value="' + esc(f.justificativa) + '" placeholder="Ex.: único com entrega amanhã"></label>' +
      '<div id="blocoEmitir" class="campo" style="gap:14px">' + camposOC(p, f, false) + '</div>' +
      '<p class="aviso" id="avisoDir" hidden>Acima da alçada: a OC só sai depois da aprovação da diretoria.</p>' +
      '<p class="erro" id="cErro" hidden></p>' +
      '<div class="acoes"><button class="btn sec" id="btnSalvarCot">Salvar</button><button class="btn" id="btnEmitir">Emitir OC</button><button class="btn" id="btnDiretoria" hidden>Enviar p/ diretoria</button></div></div>';
    return html;
  }

  function camposOC(p, f, comPagamento) {
    var emps = S.snap.empresas || [];
    return '<h3>Dados da OC</h3>' +
      '<div class="linha"><label>Empresa da OC<select id="oEmp">' + emps.map(function (e) { return '<option' + (e === f.empresa ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select></label>' +
      '<label>Previsão de entrega<input id="oPrev" type="date" value="' + esc(f.previsao) + '"></label></div>' +
      (comPagamento ? '<label>Condição de pagamento<input id="oPag" value="' + esc(f.pagamento) + '"></label>' : '') +
      '<label>Local de entrega<input id="oLocal" value="' + esc(f.local) + '" placeholder="Endereço ou referência da obra"></label>' +
      '<label>Observação para o fornecedor <small>sai na OC</small><input id="oObsF" value="' + esc(f.obsForn) + '" placeholder="Ex.: entregar das 7h às 17h, falar com o encarregado"></label>';
  }

  function tabelaCotacoes(p, cots, venc) {
    var itens = p.itens || [];
    if (!cots.length) return '';
    var menor = itens.map(function (_, i) { var v = cots.map(function (c) { return num(c.precos[i]); }).filter(function (x) { return x > 0; }); return v.length ? Math.min.apply(null, v) : 0; });
    var totais = cots.map(function (c) { return totalCot(c, itens); });
    var minTot = Math.min.apply(null, totais.filter(function (x) { return x > 0; }).concat([Infinity]));
    return '<div class="tabela"><table><thead><tr><th>Item</th>' + cots.map(function (c, k) { return '<th class="num">' + (k === venc ? '✓ ' : '') + esc(c.fornecedor || 'Orçamento ' + (k + 1)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      itens.map(function (it, i) {
        return '<tr><td>' + esc(it.desc) + '<br><span class="hint">' + fmtNum(it.qtd) + ' ' + esc(it.un) + '</span></td>' + cots.map(function (c, k) {
          var v = num(c.precos[i]);
          return '<td class="num' + (k === venc ? ' venc' : '') + '"' + (k === venc ? ' style="background:var(--warn-bg)"' : '') + '>' + (v ? (v === menor[i] && cots.length > 1 ? '<b>' + reais(v) + '</b>' : reais(v)) : '—') + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '<tr><td>Frete</td>' + cots.map(function (c, k) { return '<td class="num"' + (k === venc ? ' style="background:var(--warn-bg)"' : '') + '>' + (num(c.frete) ? reais(c.frete) : '—') + '</td>'; }).join('') + '</tr>' +
      '<tr><td><b>Total</b></td>' + totais.map(function (t, k) { return '<td class="num"' + (k === venc ? ' style="background:var(--warn-bg)"' : '') + '><b' + (t === minTot && cots.length > 1 ? ' style="color:var(--ok)"' : '') + '>' + reais(t) + '</b></td>'; }).join('') + '</tr>' +
      '<tr><td>Prazo</td>' + cots.map(function (c) { return '<td class="num">' + esc(c.prazo || '—') + '</td>'; }).join('') + '</tr>' +
      '<tr><td>Pagamento</td>' + cots.map(function (c) { return '<td class="num">' + esc(c.pagamento || '—') + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div>' + (cots.length > 1 ? '<p class="hint">Em negrito, o menor preço de cada item. ✓ = orçamento escolhido.</p>' : '');
  }

  function cardCotacaoLeitura(p) {
    if (p.status === ST.DIR && P().diretoria) return '';
    return '<div class="card"><h3>Cotação</h3>' + tabelaCotacoes(p, p.cotacoes, p.vencedora) +
      (p.justificativa ? '<div class="campo">Por que este fornecedor<div class="bloco">' + esc(p.justificativa) + '</div></div>' : '') +
      (p.status === ST.DIR ? '<p class="aviso">Aguardando a aprovação da diretoria (acima de ' + reais(S.snap.alcada) + ').</p>' : '') + '</div>';
  }

  function cardDiretoria(p, f) {
    return '<div class="card"><h3>Aprovação da diretoria</h3>' +
      '<div class="resumo"><div><span>Escolhido pelo comprador ' + esc(p.comprador) + '</span><br><b>' + esc(p.fornecedor) + '</b></div><b>' + reais(p.valorTotal) + '</b></div>' +
      tabelaCotacoes(p, p.cotacoes, p.vencedora) +
      (p.justificativa ? '<div class="campo">Por que este fornecedor<div class="bloco">' + esc(p.justificativa) + '</div></div>' : '') +
      '<label>Observação <small>obrigatória para devolver ou cancelar</small><input id="dMot" value="' + esc(f.motivoDir) + '" placeholder="Ex.: negociar o frete, pedir mais um orçamento"></label>' +
      '<p class="erro" id="dErro" hidden></p>' +
      '<button class="btn" id="btnDirAprovar">Aprovar compra</button>' +
      '<div class="acoes"><button class="btn sec" id="btnDirDevolver">Devolver ao comprador</button><button class="btn perigo" id="btnDirCancelar">Cancelar pedido</button></div></div>';
  }

  function cardEmitir(p, f) {
    return '<div class="card"><h3>Emitir a OC</h3>' +
      '<div class="resumo"><div><span>Aprovado pela diretoria · ' + esc(p.diretoria) + '</span><br><b>' + esc(p.fornecedor) + '</b></div><b>' + reais(p.valorTotal) + '</b></div>' +
      camposOC(p, f, true) + '<p class="erro" id="cErro" hidden></p><button class="btn" id="btnEmitir">Emitir OC</button></div>';
  }

  function cardReceber(p, f, pp) {
    var tipos = [['Total', 'Chegou tudo'], ['Parcial', 'Chegou uma parte'], ['Problema', 'Chegou com problema']];
    return '<div class="card"><h3>Receber material</h3>' +
      '<p class="hint">' + esc(p.fornecedor) + ' · ' + esc(p.oc) + ' · previsão ' + esc(p.previsao || '—') + '</p>' +
      (p.os ? '<p class="aviso">Peça da oficina (' + esc(p.os) + ' · ' + esc(p.maquina) + '): normalmente quem confirma a chegada é a oficina, pelo app da Oficina. Use aqui só se a peça foi entregue no escritório.</p>' : '') +
      '<div class="campo">O que chegou?<div class="seg tres">' + tipos.map(function (t) { return '<button data-rec="' + t[0] + '" aria-pressed="' + (f.rec === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
      '<label>Observação <small>' + (f.rec && f.rec !== 'Total' ? 'obrigatória: o que chegou, o que faltou ou o problema' : 'opcional') + '</small><textarea id="rObs" placeholder="Ex.: chegaram 30 dos 50 sacos; 2 tubos trincados">' + esc(f.obsRec) + '</textarea></label>' +
      '<div class="campo">Fotos <small>da nota fiscal, do canhoto ou do problema</small><div class="fotos">' + f.fotosRec.map(function (src, i) { return '<div class="foto"><img src="' + src + '" alt="Foto ' + (i + 1) + '"><button data-tirar="' + i + '" aria-label="Tirar foto">×</button></div>'; }).join('') +
        (f.fotosRec.length < MAX_FOTOS ? '<button class="add-foto" id="addFoto"><b>+</b>Foto</button>' : '') + '</div></div>' +
      '<p class="erro" id="rErro" hidden></p><button class="btn" id="btnReceber">Confirmar recebimento</button>' +
      (pp.comprar ? (f.abrir.prev ? '<div class="campo" style="gap:12px;border-top:1px solid var(--line);padding-top:14px"><h3>Nova previsão de entrega</h3><div class="linha"><label>Nova data<input id="pPrev" type="date" value="' + esc(f.novaPrev) + '"></label><label>Motivo<input id="pMot" value="' + esc(f.motivoPrev) + '" placeholder="Ex.: fornecedor sem estoque"></label></div><p class="erro" id="pErro" hidden></p><button class="btn sec" id="btnNovaPrev">Salvar nova previsão</button></div>'
        : '<button class="oculto-link" data-abrir="prev">Alterar a previsão de entrega</button>') : '') + '</div>';
  }

  function cardCancelar(p, f) {
    return '<div class="card">' + (f.abrir.cancelar
      ? '<h3>Cancelar pedido</h3>' + (p.oc ? '<p class="aviso">Este pedido já tem OC. Avise o fornecedor depois de cancelar.</p>' : '') + '<label>Motivo<input id="xMot" value="' + esc(f.motivoCanc) + '" placeholder="Ex.: pedido em duplicidade"></label><p class="erro" id="xErro" hidden></p><button class="btn perigo" id="btnCancelar">Confirmar cancelamento</button>'
      : '<button class="oculto-link" data-abrir="cancelar" style="color:var(--bad)">Cancelar este pedido</button>') + '</div>';
  }

  // ----- painel -----
  function vPainel() {
    var l = pedidos(); if (!S.snap) return '';
    var agora = Date.now(), d90 = agora - 90 * 864e5, hoje = new Date(), iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime();
    var c = contagens(), mes = 0, porObra = {}, tPedOC = [], tOCEnt = [], parados = [];
    l.forEach(function (p) {
      if (p.status !== ST.CANC && p.ocEmMs) {
        if (p.ocEmMs >= iniMes) mes += num(p.valorTotal);
        if (p.ocEmMs >= d90) {
          var o = porObra[p.obra] || (porObra[p.obra] = { obra: p.obra, mes: 0, d90: 0, n: 0 });
          o.d90 += num(p.valorTotal); o.n++; if (p.ocEmMs >= iniMes) o.mes += num(p.valorTotal);
          if (p.pedidoEmMs) tPedOC.push((p.ocEmMs - p.pedidoEmMs) / 864e5);
        }
      }
      if (p.status === ST.FIM && p.recebidoEmMs && p.ocEmMs && p.recebidoEmMs >= d90) tOCEnt.push((p.recebidoEmMs - p.ocEmMs) / 864e5);
      if ([ST.AP, ST.COT, ST.OKDIR, ST.DIR].indexOf(p.status) >= 0) {
        var desde = p.status === ST.AP ? p.pedidoEmMs : (p.atualizadoMs || p.aprovadoEmMs || p.pedidoEmMs);
        var dias = desde ? Math.floor((agora - desde) / 864e5) : 0;
        if (dias >= 2) parados.push({ p: p, dias: dias });
      }
    });
    var media = function (a) { return a.length ? (a.reduce(function (s, x) { return s + x; }, 0) / a.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '–'; };
    var atrasadas = l.filter(function (p) { return atraso(p) > 0; }).sort(function (a, b) { return atraso(b) - atraso(a); });
    var obras = Object.keys(porObra).map(function (k) { return porObra[k]; }).sort(function (a, b) { return b.d90 - a.d90; });
    parados.sort(function (a, b) { return b.dias - a.dias; });
    return '<h2>Painel de compras</h2><p class="hint">Dados de ' + esc(S.snap.sincronizadoEm) + '</p>' +
      '<div class="tiles">' + t(c.ap, 'A aprovar', c.ap > 0) + t(l.filter(function (p) { return p.status === ST.COT || p.status === ST.OKDIR; }).length, 'Em cotação') +
        t(c.dir, 'Na diretoria', c.dir > 0) + t(c.rec, 'Aguardando entrega') + t(c.atr, 'Entregas atrasadas', c.atr > 0) +
        '<div class="tile"><span class="n" style="font-size:22px;line-height:30px">' + compacto(mes) + '</span><span class="l">Comprado no mês</span></div></div>' +
      '<div class="tiles" style="grid-template-columns:1fr 1fr">' + t(media(tPedOC), 'Dias do pedido à OC (90 dias)') + t(media(tOCEnt), 'Dias da OC à entrega (90 dias)') + '</div>' +
      '<div class="card"><h3>Entregas atrasadas</h3>' + (atrasadas.length ? '<div class="tabela"><table><thead><tr><th>Pedido</th><th>Fornecedor</th><th class="num">Atraso</th></tr></thead><tbody>' +
        atrasadas.map(function (p) { return '<tr data-ped="' + esc(p.numero) + '" style="cursor:pointer"><td><b>' + esc(p.obra) + '</b><br><span class="hint">' + esc(p.oc) + ' · previsão ' + esc(p.previsao) + '</span></td><td>' + esc(p.fornecedor) + '</td><td class="num"><b style="color:var(--bad)">' + atraso(p) + ' d</b></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="hint">Nenhuma entrega atrasada.</p>') + '</div>' +
      '<div class="card"><h3>Parados há 2 dias ou mais</h3>' + (parados.length ? '<div class="tabela"><table><thead><tr><th>Pedido</th><th>Situação</th><th class="num">Dias</th></tr></thead><tbody>' +
        parados.slice(0, 15).map(function (x) { return '<tr data-ped="' + esc(x.p.numero) + '" style="cursor:pointer"><td><b>' + esc(x.p.obra) + '</b><br><span class="hint">' + esc(x.p.numero) + (x.p.urgencia === 'Urgente' ? ' · URGENTE' : '') + '</span></td><td>' + esc(x.p.status) + '</td><td class="num"><b>' + x.dias + '</b></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="hint">Nenhum pedido parado.</p>') + '</div>' +
      '<div class="card"><h3>Comprado por obra</h3>' + (obras.length ? '<div class="tabela"><table><thead><tr><th>Obra</th><th class="num">Mês</th><th class="num">90 dias</th></tr></thead><tbody>' +
        obras.map(function (o) { return '<tr><td><b>' + esc(o.obra) + '</b><br><span class="hint">' + o.n + (o.n === 1 ? ' OC' : ' OCs') + '</span></td><td class="num">' + reais(o.mes) + '</td><td class="num">' + reais(o.d90) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="hint">Valor das OCs emitidas, sem as canceladas.</p>' : '<p class="hint">Nenhuma OC emitida nos últimos 90 dias.</p>') + '</div>';
    function t(n, l2, ruim) { return '<div class="tile' + (ruim ? ' bad' : '') + '"><span class="n">' + (n || 0) + '</span><span class="l">' + l2 + '</span></div>'; }
  }

  // ----- envios -----
  function nomeAcao(i) {
    var n = i.numero || (i.args && i.args[0]) || '';
    var m = { novoPedido: 'Pedido · ' + (i.args && i.args[0] ? i.args[0].obra : ''), aprovarPedido: 'Aprovar ' + n, reprovarPedido: 'Reprovar ' + n, editarPedido: 'Corrigir itens do ' + n,
              salvarCotacoes: 'Cotações do ' + n, enviarDiretoria: 'Enviar ' + n + ' à diretoria', decidirDiretoria: 'Decisão da diretoria · ' + n, emitirOC: 'Emitir OC do ' + n,
              alterarPrevisao: 'Nova previsão · ' + n, confirmarRecebimento: 'Recebimento · ' + n, cancelarPedido: 'Cancelar ' + n };
    return m[i.acao] || i.acao;
  }
  function vEnvios() {
    var l = S.fila;
    return '<h2>Envios guardados</h2><p class="hint">O que foi feito neste celular e ainda não chegou na planilha.</p>' +
      (l.length ? '<div class="lista">' + l.map(function (i) {
        return '<div class="card"><div class="topo" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(nomeAcao(i)) + '</b>' +
          (i.falhou ? '<span class="pill bad">Erro</span>' : '<span class="pill warn">Aguardando</span>') + '</div>' +
          '<span class="hint">Feito em ' + esc(i.dataTexto || '') + '</span>' +
          (i.falhou ? '<p class="erro">' + esc(i.erro) + '</p><div class="acoes"><button class="btn sec" data-reenviar="' + esc(i.op) + '">Tentar de novo</button><button class="btn perigo" data-apagar="' + esc(i.op) + '">Apagar</button></div>' : '') +
          '</div>';
      }).join('') + '</div>' : '<div class="card vazio"><b>Tudo enviado</b><span>Não há nada guardado neste celular.</span></div>');
  }

  // ---------------- fotos ----------------
  function reduzirFoto(arquivo) {
    return new Promise(function (ok, falha) {
      var leitor = new FileReader();
      leitor.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = function () { falha(new Error('Não consegui abrir a foto.')); };
        img.src = leitor.result;
      };
      leitor.onerror = function () { falha(new Error('Não consegui ler a foto.')); };
      leitor.readAsDataURL(arquivo);
    });
  }
  function destinoFotos() { return !S.form ? null : (S.view === 'novo' ? S.form.fotos : (S.view === 'pedido' ? S.form.fotosRec : null)); }
  document.getElementById('arquivoFoto').addEventListener('change', function (ev) {
    var arqs = Array.prototype.slice.call(ev.target.files || []);
    ev.target.value = '';
    salvarCamposDaTela();
    var destino = destinoFotos(); if (!destino) return;
    Promise.all(arqs.slice(0, Math.max(0, MAX_FOTOS - destino.length)).map(reduzirFoto)).then(function (fs) {
      fs.forEach(function (f) { destino.push(f); }); render();
    }).catch(function (e) { toast(e.message); });
  });

  // ---------------- campos ----------------
  function v(id) { var el = $('#' + id); return el ? el.value : undefined; }
  function salvarCamposDaTela() {
    var f = S.form; if (!f) return;
    if (S.view === 'novo') {
      if ($('#nObra')) f.obra = v('nObra');
      if ($('#nApl')) f.aplicacao = v('nApl');
      if ($('#nMaq')) f.maquina = v('nMaq');
      if ($('#nAte')) f.precisaAte = v('nAte');
      if ($('#nObs')) f.observacao = v('nObs');
      lerItens('n', f.itens);
    } else if (S.view === 'pedido') {
      lerItens('e', f.itens);
      [['aObs', 'obsEsc'], ['rMot', 'motivoRep'], ['dMot', 'motivoDir'], ['xMot', 'motivoCanc'], ['cJust', 'justificativa'], ['oEmp', 'empresa'], ['oPrev', 'previsao'], ['oPag', 'pagamento'],
       ['oLocal', 'local'], ['oObsF', 'obsForn'], ['rObs', 'obsRec'], ['pPrev', 'novaPrev'], ['pMot', 'motivoPrev']].forEach(function (x) { var val = v(x[0]); if (val !== undefined) f[x[1]] = val; });
      lerCotacoes(f);
    }
  }
  function lerCotacoes(f) {
    f.cotacoes.forEach(function (c, k) {
      if (!$('#c' + k + 'f')) return;
      c.fornecedor = v('c' + k + 'f'); c.frete = v('c' + k + 'fr'); c.prazo = v('c' + k + 'pz'); c.pagamento = v('c' + k + 'pg');
      c.precos = c.precos.map(function (x, i) { var val = v('c' + k + 'p' + i); return val === undefined ? x : val; });
    });
  }
  function cotacoesParaEnvio(f) {
    return f.cotacoes.map(function (c) {
      return { fornecedor: String(c.fornecedor || '').trim(), precos: c.precos.map(function (x) { return vazio(String(x).trim()) ? '' : num(x); }),
               frete: vazio(String(c.frete || '').trim()) ? '' : num(c.frete), prazo: c.prazo, pagamento: c.pagamento, obs: c.obs || '' };
    });
  }

  // atualiza totais da cotação sem redesenhar (para não perder o foco do teclado)
  function atualizarTotais() {
    var f = S.form, p = acharPedido(f.numero); if (!p || !$('#resumoCot')) return;
    lerCotacoes(f);
    var itens = p.itens || [], alc = S.snap.alcada;
    f.cotacoes.forEach(function (c, k) { var el = $('#c' + k + 'tot'); if (el) el.textContent = reais(totalCot(c, itens)); });
    var q = f.cotacoes[f.vencedora], total = q ? totalCot(q, itens) : 0, acima = total > alc;
    $('#resumoCot').innerHTML = q ? '<div><span>Escolhido</span><br><b style="font-size:20px">' + esc(q.fornecedor || 'Orçamento ' + (f.vencedora + 1)) + '</b></div><b>' + reais(total) + '</b>'
      : '<span>Toque em "Escolher este" no orçamento vencedor.</span>';
    $('#blocoEmitir').hidden = acima; $('#avisoDir').hidden = !acima;
    $('#btnEmitir').hidden = acima; $('#btnDiretoria').hidden = !acima;
  }

  // ---------------- ações ----------------
  function mostrarErro(id, msg) { var e = $('#' + id); if (!e) { toast(msg); return; } e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

  function ligar() {
    app.oninput = null; app.onchange = null;
    app.querySelectorAll('[data-ir]').forEach(function (b) { b.onclick = function () { ir(b.dataset.ir, b.dataset.tipo ? { tipo: b.dataset.tipo } : null); }; });
    var bi = $('#btnInstalar'); if (bi) bi.onclick = function () { var p = S.instalar; S.instalar = null; p.prompt(); p.userChoice.then(function () { render(); }); };
    ligarLogin();
    app.querySelectorAll('[data-ped]').forEach(function (b) { b.onclick = function () { ir('pedido', { numero: b.dataset.ped }); }; });
    app.querySelectorAll('[data-filtro]').forEach(function (b) { b.onclick = function () { S.filtro = b.dataset.filtro; render(); }; });
    var bu = $('#busca');
    if (bu) bu.oninput = function () {
      S.busca = bu.value;
      var tipo = (S.dados && S.dados.tipo) || 'meus', cfg = tiposLista()[tipo];
      var vis = pedidos().filter(cfg.base); if (cfg.chips) vis = vis.filter(FILTROS[S.filtro]);
      $('#resLista').innerHTML = listaHtml([], filtrarBusca(vis, S.busca));
      $('#resLista').querySelectorAll('[data-ped]').forEach(function (b) { b.onclick = function () { ir('pedido', { numero: b.dataset.ped }); }; });
    };
    app.querySelectorAll('[data-reenviar]').forEach(function (b) { b.onclick = function () { reenviar(b.dataset.reenviar); }; });
    app.querySelectorAll('[data-apagar]').forEach(function (b) { b.onclick = function () { apagarEnvio(b.dataset.apagar, b); }; });
    var af = $('#addFoto'); if (af) af.onclick = function () { document.getElementById('arquivoFoto').click(); };
    app.querySelectorAll('[data-tirar]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); destinoFotos().splice(Number(b.dataset.tirar), 1); render(); }; });
    app.querySelectorAll('[data-tiraritem]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); if (S.form.itens.length > 1) S.form.itens.splice(Number(b.dataset.tiraritem), 1); render(); }; });
    var mi = $('#maisItem'); if (mi) mi.onclick = function () {
      salvarCamposDaTela(); S.form.itens.push(itemVazio()); render();
      var pf = S.view === 'novo' ? 'n' : 'e', el = $('#' + pf + 'd' + (S.form.itens.length - 1)); if (el) el.focus();
    };
    if (S.view === 'novo') {
      app.querySelectorAll('[data-urg]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); S.form.urgencia = b.dataset.urg; render(); }; });
      $('#btnEnviar').onclick = enviarPedido;
    }
    if (S.view === 'pedido') ligarPedido();
  }

  function ligarLogin() {
    var be = $('#btnEntrar'); if (!be) return;
    var pin = $('#lPin'), nome = $('#lNome');
    var atual = S.login.nome || lerLS('compras_nome'); if (atual && S.login.nomes) nome.value = atual;
    nome.onchange = function () { S.login.nome = nome.value; };
    var entrar = function () {
      S.login.nome = nome.value;
      if (!nome.value) { S.login.msg = 'Escolha o seu nome.'; render(); return; }
      be.disabled = true; be.textContent = 'Entrando…';
      C.chamar('entrar', [nome.value, pin.value]).then(function (r) {
        S.token = r.token; guardarLS('compras_nome', nome.value);
        return L.gravar('token', r.token).then(function () { return C.chamar('sincronizar', [], r.token); });
      }).then(function (snap) {
        snap.recebidoEm = Date.now(); S.snap = snap; S.online = true;
        return L.gravar('snap', snap);
      }).then(function () { S.pilha = []; ir('inicio', null, true); })
        .catch(function (e) { S.login.msg = e.rede ? 'Sem internet. Para entrar, o celular precisa estar conectado.' : (e.message || 'Não foi possível entrar.'); render(); });
    };
    be.onclick = entrar;
    pin.onkeydown = function (ev) { if (ev.key === 'Enter') entrar(); };
  }

  function ligarPedido() {
    var f = S.form, p = acharPedido(f.numero); if (!p) return;
    var sujar = function () { if (S.form) S.form.sujo = true; };
    app.oninput = sujar; app.onchange = sujar;
    app.querySelectorAll('[data-abrir],[data-venc],[data-rec],[data-tirarcot],[data-tiraritem],[data-tirar],#maisCot,#maisItem,#addFoto').forEach(function (b) { b.addEventListener('click', sujar); });
    app.querySelectorAll('[data-abrir]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); f.abrir[b.dataset.abrir] = !f.abrir[b.dataset.abrir]; render(); }; });
    app.querySelectorAll('[data-pdf]').forEach(function (b) { b.onclick = function () { gerarPdf(p.numero, b.dataset.pdf, b); }; });
    // cotação
    app.querySelectorAll('[data-calc]').forEach(function (el) { el.oninput = atualizarTotais; });
    app.querySelectorAll('[data-venc]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); f.vencedora = Number(b.dataset.venc); render(); }; });
    app.querySelectorAll('[data-tirarcot]').forEach(function (b) { b.onclick = function () {
      salvarCamposDaTela(); var k = Number(b.dataset.tirarcot); f.cotacoes.splice(k, 1);
      if (f.vencedora === k) f.vencedora = f.cotacoes.length === 1 ? 0 : -1; else if (f.vencedora > k) f.vencedora--;
      render();
    }; });
    var mc = $('#maisCot'); if (mc) mc.onclick = function () { salvarCamposDaTela(); f.cotacoes.push(cotVazia((p.itens || []).length)); render(); var el = $('#c' + (f.cotacoes.length - 1) + 'f'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } };
    if ($('#resumoCot')) atualizarTotais();
    clique('btnAprovar', function () { aprovar(p); });
    clique('btnReprovar', function () { reprovar(p); });
    clique('btnSalvarItens', function () { salvarItens(p); });
    clique('btnSalvarCot', function () { cotacao(p, 'salvarCotacoes'); });
    clique('btnDiretoria', function () { cotacao(p, 'enviarDiretoria'); });
    clique('btnEmitir', function () { emitir(p); });
    clique('btnDirAprovar', function () { diretoria(p, 'aprovar'); });
    clique('btnDirDevolver', function () { diretoria(p, 'devolver'); });
    clique('btnDirCancelar', function () { diretoria(p, 'cancelar'); });
    app.querySelectorAll('[data-rec]').forEach(function (b) { b.onclick = function () { salvarCamposDaTela(); f.rec = b.dataset.rec; render(); }; });
    clique('btnReceber', function () { receberMaterial(p); });
    clique('btnNovaPrev', function () { novaPrevisao(p); });
    clique('btnCancelar', function () { cancelar(p); });
  }
  function clique(id, fn) { var b = $('#' + id); if (b) b.onclick = fn; }

  function enviarPedido() {
    salvarCamposDaTela();
    var f = S.form;
    if (!f.obra) return mostrarErro('nErro', 'Escolha a obra.');
    var r = validarItens(f.itens); if (r.erro) return mostrarErro('nErro', r.erro);
    var maq = '';
    if (String(f.maquina || '').trim()) {
      var m = acharMaquina(f.maquina);
      if (!m) return mostrarErro('nErro', 'Escolha a máquina da lista (pelo apelido) ou deixe o campo em branco.');
      maq = m.apelido;
    }
    guardarLS('compras_obra', f.obra);
    var op = C.novoCodigo();
    var dados = { obra: f.obra, aplicacao: f.aplicacao, maquina: maq, urgencia: f.urgencia, precisaAte: f.precisaAte, itens: r.itens, observacao: f.observacao,
                  fotos: f.fotos.map(function (b) { return { base64: b }; }), quando: Date.now(), idCliente: op };
    var item = { op: op, acao: 'novoPedido', args: [dados], criadoEm: Date.now(), seq: S.fila.length, dataTexto: agoraTexto() };
    L.enfileirar(item).then(recarregarFila).then(function () {
      S.form = null; S.pilha = [];
      toast(S.online ? 'Pedido guardado. Enviando…' : 'Pedido guardado no celular. Vai ser enviado quando o sinal voltar.');
      ir('lista', { tipo: 'meus' }, true);
      S.pilha = [{ view: 'inicio' }];
      pedirEnvioEmSegundoPlano();
      sincronizar();
    }).catch(function () { mostrarErro('nErro', 'Não consegui guardar o pedido neste celular. Tente de novo.'); });
  }

  // aplica a mudança no celular na hora; a planilha confirma depois
  function executar(p, acao, args, aplicar, msg) {
    var u = U();
    aplicar(p);
    p.atualizado = agoraTexto(); p.atualizadoPor = u.nome; p.atualizadoMs = Date.now();
    return salvarSnap().then(function () { return enfileirar(acao, args, { numero: p.numero }); }).then(function () {
      S.form = null; render(); window.scrollTo(0, 0);
      toast(msg + (S.online ? '' : ' (será enviado quando o sinal voltar)'));
    });
  }

  function aprovar(p) {
    salvarCamposDaTela();
    var f = S.form, d = { obsEscritorio: f.obsEsc };
    if (f.abrir.itens) { var r = validarItens(f.itens); if (r.erro) return mostrarErro('aErro', r.erro); d.itens = r.itens; }
    executar(p, 'aprovarPedido', [p.numero, d], function (x) {
      if (d.itens) x.itens = d.itens;
      x.status = ST.COT; x.aprovadoPor = U().nome; x.aprovadoEm = agoraTexto(); x.aprovadoEmMs = Date.now(); x.obsEscritorio = d.obsEscritorio;
    }, p.numero + ' aprovado');
  }
  function reprovar(p) {
    salvarCamposDaTela();
    var m = String(S.form.motivoRep || '').trim(); if (!m) return mostrarErro('aErro', 'Escreva o motivo da reprovação.');
    executar(p, 'reprovarPedido', [p.numero, m], function (x) { x.status = ST.REP; x.motivo = 'Reprovado por ' + U().nome + ': ' + m; }, p.numero + ' reprovado');
  }
  function salvarItens(p) {
    salvarCamposDaTela();
    var r = validarItens(S.form.itens); if (r.erro) return mostrarErro('eErro', r.erro);
    executar(p, 'editarPedido', [p.numero, { itens: r.itens }], function (x) {
      x.itens = r.itens;
      (x.cotacoes || []).forEach(function (c) { c.precos = r.itens.map(function (_, i) { return c.precos[i] === undefined ? '' : c.precos[i]; }); });
    }, 'Itens corrigidos');
  }
  function aplicarCot(x, d) {
    x.cotacoes = d.cotacoes; x.vencedora = d.vencedora; x.justificativa = d.justificativa; x.comprador = U().nome;
    var q = d.cotacoes[d.vencedora];
    x.fornecedor = q ? q.fornecedor : ''; x.valorTotal = q ? totalCot(q, x.itens) : '';
  }
  function dadosCot() {
    var f = S.form;
    return { cotacoes: cotacoesParaEnvio(f), vencedora: f.vencedora, justificativa: f.justificativa };
  }
  function checarVencedora(p, d, idErro) {
    var q = d.cotacoes[d.vencedora];
    if (!q) return mostrarErro(idErro, 'Toque em "Escolher este" no orçamento vencedor.'), false;
    if (!q.fornecedor) return mostrarErro(idErro, 'Escreva o nome do fornecedor do orçamento escolhido.'), false;
    if (faltaPreco(q, p.itens)) return mostrarErro(idErro, 'Preencha o preço de todos os itens no orçamento escolhido.'), false;
    return true;
  }
  function cotacao(p, acao) {
    salvarCamposDaTela();
    var d = dadosCot();
    if (acao === 'enviarDiretoria' && !checarVencedora(p, d, 'cErro')) return;
    if (acao === 'salvarCotacoes' && !d.cotacoes.some(function (c) { return c.fornecedor; })) return mostrarErro('cErro', 'Escreva pelo menos o nome de um fornecedor.');
    executar(p, acao, [p.numero, d], function (x) { aplicarCot(x, d); if (acao === 'enviarDiretoria') { x.status = ST.DIR; x.motivo = ''; } },
      acao === 'enviarDiretoria' ? 'Enviado para a diretoria' : 'Cotações salvas');
  }
  function emitir(p) {
    salvarCamposDaTela();
    var f = S.form, d = { empresa: f.empresa, previsao: f.previsao, local: f.local, obsFornecedor: f.obsForn };
    if (p.status === ST.COT) {
      var c = dadosCot(); if (!checarVencedora(p, c, 'cErro')) return;
      if (totalCot(c.cotacoes[c.vencedora], p.itens) > S.snap.alcada) return mostrarErro('cErro', 'Acima da alçada: envie para a diretoria.');
      d.cotacoes = c.cotacoes; d.vencedora = c.vencedora; d.justificativa = c.justificativa;
    } else d.pagamento = f.pagamento;
    if (!d.empresa) return mostrarErro('cErro', 'Escolha a empresa da OC.');
    if (!d.previsao) return mostrarErro('cErro', 'Informe a previsão de entrega.');
    executar(p, 'emitirOC', [p.numero, d], function (x) {
      if (d.cotacoes) aplicarCot(x, d);
      var q = x.cotacoes[x.vencedora] || {};
      x.status = ST.ENT; x.oc = '(número ao enviar)'; x.ocEm = agoraTexto(); x.ocEmMs = Date.now(); x.empresa = d.empresa;
      x.previsaoISO = d.previsao; x.previsao = isoBR(d.previsao); x.pagamento = d.pagamento || q.pagamento || ''; x.local = d.local; x.obsFornecedor = d.obsFornecedor; x.motivo = '';
    }, 'OC emitida. O PDF sai em seguida.');
  }
  function diretoria(p, decisao) {
    salvarCamposDaTela();
    var m = String(S.form.motivoDir || '').trim();
    if (decisao !== 'aprovar' && !m) return mostrarErro('dErro', decisao === 'devolver' ? 'Escreva o que o comprador deve rever.' : 'Escreva o motivo do cancelamento.');
    var nome = U().nome;
    executar(p, 'decidirDiretoria', [p.numero, { decisao: decisao, motivo: m }], function (x) {
      if (decisao === 'aprovar') { x.status = ST.OKDIR; x.diretoria = nome; x.diretoriaEm = agoraTexto(); x.motivo = m ? 'Diretoria (' + nome + '): ' + m : ''; }
      else if (decisao === 'devolver') { x.status = ST.COT; x.motivo = 'Devolvido pela diretoria (' + nome + '): ' + m; }
      else { x.status = ST.CANC; x.motivo = 'Cancelado pela diretoria (' + nome + '): ' + m; }
    }, decisao === 'aprovar' ? 'Compra aprovada' : decisao === 'devolver' ? 'Devolvido ao comprador' : 'Pedido cancelado');
  }
  function receberMaterial(p) {
    salvarCamposDaTela();
    var f = S.form;
    if (!f.rec) return mostrarErro('rErro', 'Escolha: chegou tudo, uma parte ou com problema.');
    if (f.rec !== 'Total' && !String(f.obsRec).trim()) return mostrarErro('rErro', 'Escreva o que chegou e o que faltou, ou qual foi o problema.');
    var d = { tipo: f.rec, obs: f.obsRec, fotos: f.fotosRec.map(function (b) { return { base64: b }; }), quando: Date.now() };
    var rot = { Total: ['Recebido completo', ST.FIM], Parcial: ['Recebido em parte', ST.PARC], Problema: ['Chegou com problema', ST.PROB] }[f.rec];
    var nome = U().nome;
    executar(p, 'confirmarRecebimento', [p.numero, d], function (x) {
      x.status = rot[1]; x.recebimento = rot[0]; x.recebidoPor = nome; x.recebidoEm = agoraTexto(); x.recebidoEmMs = Date.now();
      x.obsRecebimento = (x.obsRecebimento ? x.obsRecebimento + '\n' : '') + agoraTexto() + ' · ' + nome + ' · ' + rot[0] + (d.obs ? ': ' + d.obs : '');
    }, f.rec === 'Total' ? 'Recebimento confirmado' : 'Recebimento registrado. O comprador vai ser avisado.');
  }
  function novaPrevisao(p) {
    salvarCamposDaTela();
    var f = S.form; if (!f.novaPrev) return mostrarErro('pErro', 'Escolha a nova data.');
    executar(p, 'alterarPrevisao', [p.numero, { previsao: f.novaPrev, motivo: f.motivoPrev }], function (x) { x.previsaoISO = f.novaPrev; x.previsao = isoBR(f.novaPrev); }, 'Previsão alterada');
  }
  function cancelar(p) {
    salvarCamposDaTela();
    var m = String(S.form.motivoCanc || '').trim(); if (!m) return mostrarErro('xErro', 'Escreva o motivo do cancelamento.');
    var nome = U().nome;
    executar(p, 'cancelarPedido', [p.numero, m], function (x) { x.status = ST.CANC; x.motivo = 'Cancelado por ' + nome + ': ' + m; }, p.numero + ' cancelado');
  }

  function gerarPdf(numero, tipo, btn) {
    btn.disabled = true; var txt = btn.textContent; btn.textContent = 'Gerando PDF…';
    C.enviarFila().then(function (r) {
      if (r.parou === 'rede') throw new C.ErroRede();
      return C.chamar('gerarPdf', [numero, tipo === 'oc' ? 'oc' : 'requisicao'], S.token);
    }).then(function (res) {
      var p = acharPedido(numero); if (p) { if (tipo === 'oc') p.pdfOC = res.url; else p.pdfReq = res.url; }
      return salvarSnap().then(recarregarFila);
    }).then(function () { render(); toast('PDF pronto. Toque no botão do documento para abrir.'); })
      .catch(function (e) { btn.disabled = false; btn.textContent = txt; toast(e.rede ? 'Para gerar o PDF o celular precisa de internet.' : e.message); });
  }

  function reenviar(op) {
    var it = S.fila.filter(function (i) { return i.op === op; })[0]; if (!it) return;
    it.falhou = false; it.erro = '';
    L.enfileirar(it).then(recarregarFila).then(function () { render(); sincronizar(); });
  }
  function apagarEnvio(op, b) {
    if (b.dataset.certeza !== '1') { b.dataset.certeza = '1'; b.textContent = 'Toque de novo para apagar'; return; }
    L.tirarDaFila(op).then(recarregarFila).then(function () { toast('Envio apagado'); render(); });
  }

  // ---------------- eventos do celular ----------------
  window.addEventListener('online', function () { S.online = true; sincronizar(); });
  window.addEventListener('offline', function () { S.online = false; desenharEstado(); if (S.view === 'inicio') render(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(); });
  setInterval(function () { if (!document.hidden) sincronizar(); }, 120000);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.instalar = e; if (S.view === 'inicio') render(); });

  if ('serviceWorker' in navigator) {
    var tinhaControle = !!navigator.serviceWorker.controller, recarregou = false;
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!tinhaControle || recarregou || VIEWS_FORM[S.view]) return;   // não recarrega no meio de um formulário
      recarregou = true; location.reload();
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.tipo === 'fila-enviada') recarregarFila().then(function () { sincronizar(); });
    });
  }

  iniciar();
})();
