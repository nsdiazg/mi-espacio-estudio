/* =========================================================
   MI ESPACIO DE ESTUDIO - CON PERSISTENCIA Y COLORIMETRÍA
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
      // Si la imagen externa bloquea CORS, conserva el color por defecto
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

if ($('btn-config-fondo')) {$('btn-config-fondo').addEventListener('click', () => modalFondo.classList.add('abierto'));
}
if ($('btn-cerrar-modal')) {$('btn-cerrar-modal').addEventListener('click', () => modalFondo.classList.remove('abierto'));
}

if ($('input-brillo')) {
  $('input-brillo').addEventListener('input', e => {$('valor-brillo').textContent = e.target.value + '%';
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

/* ---------- 3. NAVEGACIÓN Y SECCIONES ---------- */
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

/* ---------- 4. INICIALIZACIÓN AL ABRIR ---------- */
(function inicio() {
  aplicarFondo();
  restaurarMusica();
  
  const guardada = DB.leer('seccion', 'btn-universidad');
  const boton = $(guardada);
  if (boton) boton.click();
})();