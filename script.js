/* =========================================================
   MI ESPACIO DE ESTUDIO - APLICACIÓN COMPLETA CON PERSISTENCIA
   ========================================================= */

/* ---------- 0. UTILIDADES Y BASE DE DATOS ---------- */
const $ = (id) => document.getElementById(id);
const PREFIJO = 'ee.';

const DB = {
  leer(clave, porDefecto) {
    try {
      const crudo = localStorage.getItem(PREFIJO + clave);
      return crudo === null ? porDefecto : JSON.parse(crudo);
    } catch (e) {
      return porDefecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      avisar('La imagen o dato es muy pesado para la memoria local.', 'error');
      return false;
    }
  }
};

function avisar(mensaje, tipo = '') {
  const caja = $('contenedor-avisos');
  if (!caja) return;
  const nodo = document.createElement('div');
  nodo.className = 'aviso ' + tipo;
  nodo.textContent = mensaje;
  caja.appendChild(nodo);
  setTimeout(() => nodo.remove(), 4000);
}

const escapar = (txt = '') => String(txt).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const idNuevo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function claveFecha(fecha = new Date()) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasRestantes(cadena) {
  if (!cadena) return 0;
  const [a, m, d] = cadena.split('-').map(Number);
  const objetivo = new Date(a, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  objetivo.setHours(0, 0, 0, 0);
  return Math.round((objetivo - hoy) / 86400000);
}

/* ---------- 1. FONDO Y COLORIMETRÍA AUTOMÁTICA ---------- */
const modalFondo = $('modal-fondo');

function adaptarColorimetria(urlImagen) {
  if (!urlImagen || urlImagen.startsWith('data:image/gif')) return;
  
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = urlImagen;
  
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 50;
    canvas.height = 50;
    ctx.drawImage(img, 0, 0, 50, 50);
    
    try {
      const data = ctx.getImageData(0, 0, 50, 50).data;
      let r = 0, g = 0, b = 0, conteo = 0;
      
      for (let i = 0; i < data.length; i += 16) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        conteo++;
      }
      
      r = Math.floor(r / conteo);
      g = Math.floor(g / conteo);
      b = Math.floor(b / conteo);
      
      const brillo = (r * 299 + g * 587 + b * 114) / 1000;
      if (brillo < 80) { r += 40; g += 40; b += 40; }
      
      const colorDominante = `rgb(${r}, ${g}, ${b})`;
      document.documentElement.style.setProperty('--accent-primario', colorDominante);
    } catch (e) {
      // Mantiene el color base si CORS bloquea el acceso
    }
  };
}

function aplicarFondo() {
  const url = DB.leer('fondo', '');
  const brillo = DB.leer('brillo', 70);
  
  const overlay = $('bg-overlay');
  if (overlay) {
    overlay.style.backgroundImage = url ? `url("${url}")` : 'none';
  }
  
  document.documentElement.style.setProperty('--brillo-fondo', brillo / 100);
  
  if ($('input-url-fondo'))$('input-url-fondo').value = url.startsWith('data:') ? '' : url;
  if ($('input-brillo'))$('input-brillo').value = brillo;
  if ($('valor-brillo'))$('valor-brillo').textContent = brillo + '%';

  if (url) adaptarColorimetria(url);
}

if ($('btn-config-fondo')) {$('btn-config-fondo').addEventListener('click', () => modalFondo && modalFondo.classList.add('abierto'));
}
if ($('btn-cerrar-modal')) {$('btn-cerrar-modal').addEventListener('click', () => modalFondo && modalFondo.classList.remove('abierto'));
}

if ($('input-brillo')) {$('input-brillo').addEventListener('input', e => {
    if ($('valor-brillo'))$('valor-brillo').textContent = e.target.value + '%';
    document.documentElement.style.setProperty('--brillo-fondo', e.target.value / 100);
  });
}

if ($('btn-aplicar-fondo')) {$('btn-aplicar-fondo').addEventListener('click', () => {
    const url = $('input-url-fondo') ?$('input-url-fondo').value.trim() : '';
    DB.guardar('fondo', url);
    DB.guardar('brillo', Number($('input-brillo') ?$('input-brillo').value : 70));
    aplicarFondo();
    if (modalFondo) modalFondo.classList.remove('abierto');
    avisar('Fondo guardado correctamente.', 'ok');
  });
}

if ($('btn-restaurar-fondo')) {$('btn-restaurar-fondo').addEventListener('click', () => {
    DB.guardar('fondo', '');
    DB.guardar('brillo', 70);
    document.documentElement.style.setProperty('--accent-primario', '#3d8bff');
    aplicarFondo();
    if (modalFondo) modalFondo.classList.remove('abierto');
  });
}

if ($('input-archivo-fondo')) {$('input-archivo-fondo').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      DB.guardar('fondo', lector.result);
      aplicarFondo();
      if (modalFondo) modalFondo.classList.remove('abierto');
      avisar('Fondo guardado.', 'ok');
    };
    lector.readAsDataURL(archivo);
  });
}

/* ---------- 2. MÚSICA CON MEMORIA PERSISTENTE ---------- */
const LOFI_POR_DEFECTO = 'https://www.youtube.com/embed/jfKfPfyJRdk';

function convertirAEmbed(url) {
  url = url.trim();
  if (url.includes('spotify.com') && !url.includes('/embed/')) {
    return url.replace('spotify.com/', 'spotify.com/embed/').split('?')[0];
  }
  const yt = url.match(/[?&]v=([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const corto = url.match(/youtu\.be\/([\w-]{11})/);
  if (corto) return `https://www.youtube.com/embed/${corto[1]}`;
  return url;
}

function cargarMusica(url) {
  const iframe = $('iframe-player');
  if (iframe) iframe.src = url;
  DB.guardar('musica', url);
}

if ($('btn-guardar-musica')) {$('btn-guardar-musica').addEventListener('click', () => {
    const campo = $('input-url-musica');
    if (!campo || !campo.value.trim()) return;
    const embed = convertirAEmbed(campo.value);
    cargarMusica(embed);
    avisar('Playlist guardada en memoria.', 'ok');
  });
}

if ($('btn-restaurar-musica')) {$('btn-restaurar-musica').addEventListener('click', () => {
    if ($('input-url-musica'))$('input-url-musica').value = '';
    cargarMusica(LOFI_POR_DEFECTO);
  });
}

function restaurarMusica() {
  const guardada = DB.leer('musica', LOFI_POR_DEFECTO);
  const iframe = $('iframe-player');
  if (iframe) iframe.src = guardada;
  if ($('input-url-musica') && guardada !== LOFI_POR_DEFECTO) {$('input-url-musica').value = guardada;
  }
}

/* ---------- 3. MATERIAS Y ENTREGAS ---------- */
let materias = DB.leer('materias', []);

function guardarMaterias() {
  DB.guardar('materias', materias);
  renderMaterias();
}

function renderMaterias() {
  const cont = $('contenedor-materias');
  if (!cont) return;
  cont.innerHTML = '';

  if (materias.length === 0) {
    cont.innerHTML = `<p class="vacio">No has agregado materias aún.</p>`;
    return;
  }

  materias.forEach(mat => {
    const div = document.createElement('div');
    div.className = 'tarjeta-materia';
    
    let entregasHTML = '';
    if (mat.entregas && mat.entregas.length > 0) {
      entregasHTML = mat.entregas.map(ent => {
        const dias = diasRestantes(ent.fecha);
        const claseDias = dias < 0 ? 'vencido' : (dias <= 3 ? 'urgente' : 'normal');
        return `
          <div class="item-entrega ${claseDias}">
            <span>${escapar(ent.titulo)} (${ent.fecha})</span>
            <button onclick="eliminarEntrega('${mat.id}', '${ent.id}')">✕</button>
          </div>
        `;
      }).join('');
    } else {
      entregasHTML = '<p class="texto-mutado">Sin entregas programadas</p>';
    }

    div.innerHTML = `
      <h3>${escapar(mat.nombre)}</h3>
      <div class="lista-entregas">${entregasHTML}</div>
      <div class="form-subitem">
        <input type="text" id="ent-title-${mat.id}" placeholder="Nueva entrega...">
        <input type="date" id="ent-date-${mat.id}">
        <button onclick="agregarEntrega('${mat.id}')">+</button>
      </div>
      <button class="btn-eliminar" onclick="eliminarMateria('${mat.id}')">Eliminar Materia</button>
    `;
    cont.appendChild(div);
  });
}

function agregarMateria() {
  const input = $('input-nombre-materia');
  if (!input || !input.value.trim()) return;
  materias.push({ id: idNuevo(), nombre: input.value.trim(), entregas: [] });
  input.value = '';
  guardarMaterias();
}

function eliminarMateria(id) {
  materias = materias.filter(m => m.id !== id);
  guardarMaterias();
}

function agregarEntrega(materiaId) {
  const tInput = $(`ent-title-${materiaId}`);
  const dInput = $(`ent-date-${materiaId}`);
  if (!tInput || !dInput || !tInput.value.trim() || !dInput.value) return;

  const mat = materias.find(m => m.id === materiaId);
  if (mat) {
    if (!mat.entregas) mat.entregas = [];
    mat.entregas.push({ id: idNuevo(), titulo: tInput.value.trim(), fecha: dInput.value });
    guardarMaterias();
  }
}

function eliminarEntrega(materiaId, entregaId) {
  const mat = materias.find(m => m.id === materiaId);
  if (mat && mat.entregas) {
    mat.entregas = mat.entregas.filter(e => e.id !== entregaId);
    guardarMaterias();
  }
}

if ($('btn-agregar-materia')) {$('btn-agregar-materia').addEventListener('click', agregarMateria);
}

/* ---------- 4. TAREAS PENDIENTES ---------- */
let tareas = DB.leer('tareas', []);

function guardarTareas() {
  DB.guardar('tareas', tareas);
  renderTareas();
}

function renderTareas() {
  const cont = $('lista-tareas');
  if (!cont) return;
  cont.innerHTML = '';

  if (tareas.length === 0) {
    cont.innerHTML = `<p class="vacio">No hay tareas pendientes.</p>`;
    return;
  }

  tareas.forEach(t => {
    const div = document.createElement('div');
    div.className = `item-tarea ${t.completada ? 'completada' : ''}`;
    div.innerHTML = `
      <input type="checkbox" ${t.completada ? 'checked' : ''} onchange="toggleTarea('${t.id}')">
      <span>${escapar(t.texto)}</span>
      <button onclick="eliminarTarea('${t.id}')">✕</button>
    `;
    cont.appendChild(div);
  });
}

function agregarTarea() {
  const input = $('input-nueva-tarea');
  if (!input || !input.value.trim()) return;
  tareas.push({ id: idNuevo(), texto: input.value.trim(), completada: false });
  input.value = '';
  guardarTareas();
}

function toggleTarea(id) {
  const t = tareas.find(item => item.id === id);
  if (t) {
    t.completada = !t.completada;
    guardarTareas();
  }
}

function eliminarTarea(id) {
  tareas = tareas.filter(t => t.id !== id);
  guardarTareas();
}

if ($('btn-agregar-tarea')) {$('btn-agregar-tarea').addEventListener('click', agregarTarea);
}

/* ---------- 5. TEMPORIZADOR POMODORO ---------- */
let tiempoRestante = 25 * 60;
let temporizadorId = null;

function actualizarRelojDisplay() {
  const mins = Math.floor(tiempoRestante / 60);
  const segs = tiempoRestante % 60;
  const display = $('display-tiempo');
  if (display) {
    display.textContent = `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
  }
}

function iniciarTemporizador() {
  if (temporizadorId) return;
  temporizadorId = setInterval(() => {
    if (tiempoRestante > 0) {
      tiempoRestante--;
      actualizarRelojDisplay();
    } else {
      clearInterval(temporizadorId);
      temporizadorId = null;
      avisar('¡Tiempo Pomodoro completado!', 'ok');
    }
  }, 1000);
}

function pausarTemporizador() {
  clearInterval(temporizadorId);
  temporizadorId = null;
}

function reiniciarTemporizador(minutos = 25) {
  pausarTemporizador();
  tiempoRestante = minutos * 60;
  actualizarRelojDisplay();
}

if ($('btn-start-pomo'))$('btn-start-pomo').addEventListener('click', iniciarTemporizador);
if ($('btn-pause-pomo'))$('btn-pause-pomo').addEventListener('click', pausarTemporizador);
if ($('btn-reset-pomo'))$('btn-reset-pomo').addEventListener('click', () => reiniciarTemporizador(25));

/* ---------- 6. FICHAS Y APUNTES ---------- */
let fichas = DB.leer('fichas', []);

function guardarFichas() {
  DB.guardar('fichas', fichas);
  renderFichas();
}

function renderFichas() {
  const cont = $('contenedor-fichas');
  if (!cont) return;
  cont.innerHTML = '';

  if (fichas.length === 0) {
    cont.innerHTML = `<p class="vacio">No hay fichas creadas.</p>`;
    return;
  }

  fichas.forEach(f => {
    const div = document.createElement('div');
    div.className = 'tarjeta-ficha';
    div.innerHTML = `
      <h4>${escapar(f.titulo)}</h4>
      <p>${escapar(f.contenido)}</p>
      <button onclick="eliminarFicha('${f.id}')">Eliminar</button>
    `;
    cont.appendChild(div);
  });
}

function agregarFicha() {
  const tInput = $('input-titulo-ficha');
  const cInput = $('input-contenido-ficha');
  if (!tInput || !cInput || !tInput.value.trim() || !cInput.value.trim()) return;

  fichas.push({ id: idNuevo(), titulo: tInput.value.trim(), contenido: cInput.value.trim() });
  tInput.value = '';
  cInput.value = '';
  guardarFichas();
}

function eliminarFicha(id) {
  fichas = fichas.filter(f => f.id !== id);
  guardarFichas();
}

if ($('btn-guardar-ficha')) {$('btn-guardar-ficha').addEventListener('click', agregarFicha);
}

/* ---------- 7. SISTEMA DE RESPALDO (JSON) ---------- */
if ($('btn-descargar-respaldo')) {$('btn-descargar-respaldo').addEventListener('click', () => {
    const estado = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIJO)) {
        estado[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_estudio_${claveFecha()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

if ($('input-cargar-respaldo')) {$('input-cargar-respaldo').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const datos = JSON.parse(lector.result);
        Object.keys(datos).forEach(k => {
          if (k.startsWith(PREFIJO)) localStorage.setItem(k, datos[k]);
        });
        location.reload();
      } catch (err) {
        avisar('El archivo de respaldo no es válido.', 'error');
      }
    };
    lector.readAsText(archivo);
  });
}

/* ---------- 8. NAVEGACIÓN Y SECCIONES ---------- */
const botonesMenu = document.querySelectorAll('.btn-menu');
const secciones = document.querySelectorAll('main section');

botonesMenu.forEach(boton => {
  boton.addEventListener('click', () => {
    botonesMenu.forEach(b => b.classList.remove('activo'));
    boton.classList.add('activo');
    secciones.forEach(s => s.classList.remove('activa'));
    const destino = $(boton.id.replace('btn-', 'sec-'));
    if (destino) destino.classList.add('activa');
    DB.guardar('seccion', boton.id);
  });
});

/* ---------- 9. INICIALIZACIÓN AL CARGAR ---------- */
(function inicio() {
  aplicarFondo();
  restaurarMusica();
  renderMaterias();
  renderTareas();
  renderFichas();
  actualizarRelojDisplay();

  const guardada = DB.leer('seccion', 'btn-universidad');
  const boton = $(guardada);
  if (boton) boton.click();
})();