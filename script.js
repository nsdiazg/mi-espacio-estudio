/* =========================================================
   MI ESPACIO DE ESTUDIO
   Todo se guarda en localStorage (local-first, sin servidor).
   ========================================================= */

/* ---------- 0. UTILIDADES ---------- */
const $ = (id) => document.getElementById(id);
const PREFIJO = 'ee.';

const DB = {
  leer(clave, porDefecto) {
    try {
      const crudo = localStorage.getItem(PREFIJO + clave);
      return crudo === null ? porDefecto : JSON.parse(crudo);
    } catch (e) {
      console.warn('Dato corrupto en', clave, e);
      return porDefecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      avisar('No queda espacio en el navegador. Borra archivos adjuntos grandes o descarga un respaldo.', 'error');
      return false;
    }
  },
  borrar(clave) { localStorage.removeItem(PREFIJO + clave); }
};

function avisar(mensaje, tipo = '') {
  const caja = $('contenedor-avisos');
  const nodo = document.createElement('div');
  nodo.className = 'aviso ' + tipo;
  nodo.textContent = mensaje;
  caja.appendChild(nodo);
  setTimeout(() => nodo.remove(), 4000);
}

const escapar = (txt = '') => String(txt).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const idNuevo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Fecha local en formato AAAA-MM-DD (sin desfase por zona horaria). */
function claveFecha(fecha = new Date()) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Días entre hoy y una fecha AAAA-MM-DD. Negativo = ya venció. */
function diasRestantes(cadena) {
  const [a, m, d] = cadena.split('-').map(Number);
  const objetivo = new Date(a, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  objetivo.setHours(0, 0, 0, 0);
  return Math.round((objetivo - hoy) / 86400000);
}

function descargar(nombre, contenido, tipo = 'text/plain') {
  const blob = new Blob([contenido], { type: tipo + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- 0.b MIGRACIÓN DE LA VERSIÓN ANTERIOR ---------- */
(function migrar() {
  if (DB.leer('migrado', false)) return;
  const viejasTareas = JSON.parse(localStorage.getItem('mis_tareas_unad') || 'null');
  if (Array.isArray(viejasTareas)) {
    DB.guardar('tareas', viejasTareas.map(t => ({
      id: idNuevo(), materia: t.materia || 'General', tarea: t.tarea || '',
      fecha: t.fecha || claveFecha(), tipo: 'Evaluación intermedia',
      archivo: t.archivo ? { nombre: t.archivo, datos: null } : null, hecha: false
    })));
  }
  const viejaNota = localStorage.getItem('mi_nota_estudio');
  if (viejaNota) DB.guardar('nota', viejaNota);
  DB.guardar('migrado', true);
})();

/* Si aún no hay semestres, se crea uno con las materias que ya existían. */
(function sembrarSemestres() {
  if (DB.leer('semestres', []).length) return;
  const previas = [...new Set(DB.leer('tareas', []).map(t => t.materia).filter(Boolean))];
  const materias = previas.map(nombre => ({ id: idNuevo(), nombre }));
  const semestre = { id: idNuevo(), nombre: 'Semestre actual', materias };
  DB.guardar('semestres', [semestre]);
  DB.guardar('semestreActivo', semestre.id);
  const tareas = DB.leer('tareas', []).map(t => {
    const m = materias.find(x => x.nombre === t.materia);
    return { ...t, semestreId: semestre.id, materiaId: m ? m.id : null };
  });
  DB.guardar('tareas', tareas);
})();

/* ---------- 1.b SEMESTRES Y MATERIAS ---------- */
const MAX_MATERIAS = 6;
let semestres = DB.leer('semestres', []);
let semestreActivo = DB.leer('semestreActivo', semestres[0] ? semestres[0].id : null);

const semestreDe = () => semestres.find(s => s.id === semestreActivo) || null;

function guardarSemestres() {
  DB.guardar('semestres', semestres);
  DB.guardar('semestreActivo', semestreActivo);
  pintarSemestres();
  actualizarMaterias();
  pintarTareas();
  renderizarCalendario();
}

function pintarSemestres() {
  const select = $('select-semestre');
  select.innerHTML = semestres.map(s =>
    `<option value="${s.id}"${s.id === semestreActivo ? ' selected' : ''}>${escapar(s.nombre)}</option>`).join('')
    || '<option value="">Sin semestres</option>';

  const sem = semestreDe();
  const grid = $('grid-materias');
  const cupo = $('cupo-materias');

  if (!sem) {
    grid.innerHTML = '<p class="vacio">Crea un semestre para empezar.</p>';
    cupo.textContent = '';
    return;
  }

  cupo.textContent = `${sem.materias.length} de ${MAX_MATERIAS} materias`;
  if (!sem.materias.length) {
    grid.innerHTML = '<p class="vacio">Este semestre todavía no tiene materias. Añádelas abajo.</p>';
    return;
  }

  grid.innerHTML = '';
  sem.materias.forEach(m => {
    const pendientes = tareas.filter(t => t.materiaId === m.id && !t.hecha).length;
    const total = tareas.filter(t => t.materiaId === m.id).length;
    const card = document.createElement('div');
    card.className = 'materia-card';
    card.innerHTML = `<h5>${escapar(m.nombre)}</h5>
      <span class="item-meta">${pendientes} pendiente(s) · ${total} en total</span>`;
    const quitar = document.createElement('button');
    quitar.className = 'quitar'; quitar.type = 'button'; quitar.textContent = '✕';
    quitar.title = 'Quitar materia';
    quitar.onclick = () => {
      const conTrabajos = tareas.filter(t => t.materiaId === m.id).length;
      const aviso = conTrabajos
        ? `"${m.nombre}" tiene ${conTrabajos} trabajo(s). Se eliminarán también. ¿Seguro?`
        : `¿Quitar "${m.nombre}"?`;
      if (!confirm(aviso)) return;
      tareas = tareas.filter(t => t.materiaId !== m.id);
      DB.guardar('tareas', tareas);
      sem.materias = sem.materias.filter(x => x.id !== m.id);
      guardarSemestres();
    };
    card.appendChild(quitar);
    grid.appendChild(card);
  });
}

$('select-semestre').addEventListener('change', e => {
  semestreActivo = e.target.value;
  guardarSemestres();
});

$('btn-nuevo-semestre').addEventListener('click', () => {
  const nombre = prompt('Nombre del semestre:', `Semestre ${semestres.length + 1}`);
  if (!nombre || !nombre.trim()) return;
  const nuevo = { id: idNuevo(), nombre: nombre.trim(), materias: [] };
  semestres.push(nuevo);
  semestreActivo = nuevo.id;
  guardarSemestres();
  avisar('Semestre creado. Ahora añade sus materias.', 'ok');
});

$('btn-renombrar-semestre').addEventListener('click', () => {
  const sem = semestreDe();
  if (!sem) return;
  const nombre = prompt('Nuevo nombre:', sem.nombre);
  if (!nombre || !nombre.trim()) return;
  sem.nombre = nombre.trim();
  guardarSemestres();
});

$('btn-borrar-semestre').addEventListener('click', () => {
  const sem = semestreDe();
  if (!sem) return;
  const suyas = tareas.filter(t => t.semestreId === sem.id).length;
  if (!confirm(`Se eliminará "${sem.nombre}" con sus ${sem.materias.length} materia(s) y ${suyas} trabajo(s). ¿Seguro?`)) return;
  tareas = tareas.filter(t => t.semestreId !== sem.id);
  DB.guardar('tareas', tareas);
  semestres = semestres.filter(s => s.id !== sem.id);
  semestreActivo = semestres[0] ? semestres[0].id : null;
  guardarSemestres();
  avisar('Semestre eliminado.');
});

$('form-materia').addEventListener('submit', e => {
  e.preventDefault();
  const sem = semestreDe();
  if (!sem) { avisar('Primero crea un semestre.', 'error'); return; }
  const nombre = $('input-nueva-materia').value.trim();
  if (!nombre) return;
  if (sem.materias.some(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
    avisar('Esa materia ya está en el semestre.', 'error'); return;
  }
  if (sem.materias.length >= MAX_MATERIAS &&
      !confirm(`Normalmente son ${MAX_MATERIAS} materias por semestre. ¿Añadir una más de todos modos?`)) return;
  sem.materias.push({ id: idNuevo(), nombre });
  guardarSemestres();
  e.target.reset();
});

/* ---------- 1. NAVEGACIÓN ---------- */
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
    if (boton.id === 'btn-calendario') renderizarCalendario();
    if (boton.id !== 'btn-qr') detenerEscaner();
  });
});

(function restaurarSeccion() {
  const guardada = DB.leer('seccion', 'btn-universidad');
  const boton = $(guardada);
  if (boton && guardada !== 'btn-universidad') boton.click();
})();

/* ---------- 2. ENTREGAS Y TABLERO KANBAN ---------- */
let tareas = DB.leer('tareas', []);

const listas = {
  urgente: $('lista-urgente'),
  semana: $('lista-semana'),
  adelante: $('lista-adelante'),
  hechas: $('lista-hechas')
};

function guardarTareas() {
  DB.guardar('tareas', tareas);
  pintarTareas();
  renderizarCalendario();
  actualizarMaterias();
  pintarSemestres();
}

function plantillaTarea(t) {
  const dias = diasRestantes(t.fecha);
  let cuando;
  if (t.hecha) cuando = 'Entregada';
  else if (dias < 0) cuando = `Venció hace ${Math.abs(dias)} día(s)`;
  else if (dias === 0) cuando = 'Hoy';
  else if (dias === 1) cuando = 'Mañana';
  else cuando = `En ${dias} días`;

  const li = document.createElement('li');
  li.className = (dias < 0 && !t.hecha ? 'vencida ' : '') + (t.hecha ? 'hecha' : '');
  li.innerHTML = `
    <div class="item-info">
      <span class="item-materia">${escapar(t.materia)} · ${escapar(t.tipo || '')}</span>
      <span class="item-titulo">${escapar(t.tarea)}</span>
      <span class="item-meta">${escapar(t.fecha)} — ${cuando}${t.archivo ? ' · ' + escapar(t.archivo.nombre) : ''}</span>
    </div>
    <div class="item-acciones"></div>`;

  const acciones = li.querySelector('.item-acciones');

  if (t.archivo && t.archivo.datos) {
    const bAbrir = document.createElement('button');
    bAbrir.className = 'mini-btn file'; bAbrir.type = 'button';
    bAbrir.textContent = '📎'; bAbrir.title = 'Abrir adjunto';
    bAbrir.onclick = () => abrirAdjunto(t.archivo);
    acciones.appendChild(bAbrir);
  }

  const bHecha = document.createElement('button');
  bHecha.className = 'mini-btn ok'; bHecha.type = 'button';
  bHecha.textContent = t.hecha ? '↩' : '✓';
  bHecha.title = t.hecha ? 'Volver a pendientes' : 'Marcar como entregada';
  bHecha.onclick = () => { t.hecha = !t.hecha; guardarTareas(); };
  acciones.appendChild(bHecha);

  const bDel = document.createElement('button');
  bDel.className = 'mini-btn del'; bDel.type = 'button';
  bDel.textContent = '✕'; bDel.title = 'Eliminar';
  bDel.onclick = () => {
    if (!confirm(`¿Eliminar "${t.tarea}"?`)) return;
    tareas = tareas.filter(x => x.id !== t.id);
    guardarTareas();
    avisar('Entrega eliminada.');
  };
  acciones.appendChild(bDel);

  return li;
}

function abrirAdjunto(archivo) {
  try {
    const [cabecera, base64] = archivo.datos.split(',');
    const mime = cabecera.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    avisar('No se pudo abrir el archivo adjunto.', 'error');
  }
}

function pintarTareas() {
  Object.values(listas).forEach(l => l && (l.innerHTML = ''));
  const filtro = $('filtro-materia').value;
  const visibles = tareas.filter(t =>
    t.semestreId === semestreActivo && (!filtro || t.materiaId === filtro));

  const pendientes = visibles.filter(t => !t.hecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hechas = visibles.filter(t => t.hecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  let nU = 0, nS = 0, nA = 0;
  pendientes.forEach(t => {
    const d = diasRestantes(t.fecha);
    if (d <= 3) { listas.urgente.appendChild(plantillaTarea(t)); nU++; }
    else if (d <= 7) { listas.semana.appendChild(plantillaTarea(t)); nS++; }
    else { listas.adelante.appendChild(plantillaTarea(t)); nA++; }
  });
  hechas.forEach(t => listas.hechas.appendChild(plantillaTarea(t)));

  const vacios = [
    [listas.urgente, 'Nada urgente. Aprovecha para adelantar.'],
    [listas.semana, 'Semana despejada.'],
    [listas.adelante, 'Aquí aparecerán las entregas lejanas.'],
    [listas.hechas, 'Todavía no marcas entregas como terminadas.']
  ];
  vacios.forEach(([lista, texto]) => {
    if (lista && !lista.children.length) lista.innerHTML = `<li class="vacio">${texto}</li>`;
  });

  $('conteo-urgente').textContent = nU;
  $('conteo-semana').textContent = nS;
  $('conteo-adelante').textContent = nA;
  $('conteo-hechas').textContent = hechas.length;

  const vencidas = pendientes.filter(t => diasRestantes(t.fecha) < 0).length;
  $('resumen-entregas').innerHTML =
    `<span class="chip"><strong>${pendientes.length}</strong> pendientes</span>` +
    (vencidas ? `<span class="chip alerta"><strong>${vencidas}</strong> vencidas</span>` : '');
}

function actualizarMaterias() {
  const sem = semestreDe();
  const materias = sem ? sem.materias : [];

  $('input-materia').innerHTML = materias.length
    ? materias.map(m => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join('')
    : '<option value="">Añade una materia primero</option>';

  const filtro = $('filtro-materia');
  const actual = filtro.value;
  filtro.innerHTML = '<option value="">Todas</option>' +
    materias.map(m => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join('');
  filtro.value = materias.some(m => m.id === actual) ? actual : '';

  // Sugerencias para las fichas de estudio
  const todas = [...new Set(semestres.flatMap(s => s.materias.map(m => m.nombre)))];
  $('lista-materias').innerHTML = todas.map(m => `<option value="${escapar(m)}">`).join('');
}

$('filtro-materia').addEventListener('change', pintarTareas);

const LIMITE_ADJUNTO = 1.5 * 1024 * 1024; // 1,5 MB: más grande no cabe en localStorage

$('form-tarea').addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivoInput = $('input-archivo');
  const archivo = archivoInput.files[0];
  let adjunto = null;

  if (archivo) {
    if (archivo.size > LIMITE_ADJUNTO) {
      adjunto = { nombre: archivo.name, datos: null };
      avisar('El archivo pesa más de 1,5 MB: se guarda solo el nombre como referencia.', 'error');
    } else {
      adjunto = { nombre: archivo.name, datos: await leerComoDataURL(archivo) };
    }
  }

  const sem = semestreDe();
  const materiaId = $('input-materia').value;
  const materia = sem && sem.materias.find(m => m.id === materiaId);
  if (!materia) { avisar('Elige una materia del semestre (o créala arriba).', 'error'); return; }

  tareas.push({
    id: idNuevo(),
    semestreId: sem.id,
    materiaId: materia.id,
    materia: materia.nombre,
    tarea: $('input-tarea').value.trim(),
    fecha: $('input-fecha').value,
    tipo: $('input-tipo').value,
    archivo: adjunto,
    hecha: false
  });

  guardarTareas();
  e.target.reset();
  avisar('Entrega guardada.', 'ok');
});

function leerComoDataURL(archivo) {
  return new Promise((res, rej) => {
    const lector = new FileReader();
    lector.onload = () => res(lector.result);
    lector.onerror = rej;
    lector.readAsDataURL(archivo);
  });
}

/* ---------- 3. CALENDARIO + MAPA DE CALOR ---------- */
let fechaActual = new Date();
let diaSeleccionado = claveFecha();
const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function minutosPorDia() { return DB.leer('minutos', {}); }

function nivelCalor(min) {
  if (!min) return 0;
  if (min < 30) return 1;
  if (min < 60) return 2;
  if (min < 120) return 3;
  return 4;
}

function renderizarCalendario() {
  const grid = $('grid-dias');
  if (!grid) return;
  grid.innerHTML = '';

  const ano = fechaActual.getFullYear();
  const mes = fechaActual.getMonth();
  $('titulo-mes-ano').textContent = `${nombresMeses[mes]} ${ano}`;

  const primerIndice = new Date(ano, mes, 1).getDay();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const minutos = minutosPorDia();
  const hoyClave = claveFecha();

  for (let i = 0; i < primerIndice; i++) {
    const v = document.createElement('div');
    v.className = 'dia-caja vacio';
    grid.appendChild(v);
  }

  for (let dia = 1; dia <= ultimoDia; dia++) {
    const clave = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const caja = document.createElement('div');
    caja.className = 'dia-caja nivel-' + nivelCalor(minutos[clave]);
    if (clave === hoyClave) caja.classList.add('hoy');
    if (clave === diaSeleccionado) caja.classList.add('seleccionado');

    const numero = document.createElement('span');
    numero.textContent = dia;
    caja.appendChild(numero);

    const delDia = tareas.filter(t => t.fecha === clave);
    if (delDia.length) {
      const fila = document.createElement('div');
      fila.className = 'fila-puntos';
      delDia.slice(0, 4).forEach(t => {
        const p = document.createElement('span');
        p.className = 'punto-tarea';
        if (t.hecha) p.style.background = 'var(--accent-green)';
        fila.appendChild(p);
      });
      caja.appendChild(fila);
    }

    caja.title = `${clave}${minutos[clave] ? ' · ' + minutos[clave] + ' min' : ''}`;
    caja.addEventListener('click', () => { diaSeleccionado = clave; renderizarCalendario(); mostrarDetalleDia(clave); });
    grid.appendChild(caja);
  }
  mostrarDetalleDia(diaSeleccionado);
}

function mostrarDetalleDia(clave) {
  const contenedor = $('detalle-contenido');
  if (!contenedor) return;
  const [a, m, d] = clave.split('-').map(Number);
  $('detalle-titulo').textContent = `${d} de ${nombresMeses[m - 1]} de ${a}`;

  const minutos = minutosPorDia()[clave] || 0;
  const delDia = tareas.filter(t => t.fecha === clave);
  const sesiones = DB.leer('sesiones', []).filter(s => s.dia === clave);

  let html = `<p class="item-meta">Tiempo registrado: <strong>${minutos} min</strong> · Sesiones: ${sesiones.length}</p>`;
  if (delDia.length) {
    html += '<ul class="lista-items">' + delDia.map(t =>
      `<li><div class="item-info"><span class="item-materia">${escapar(t.materia)}</span>
       <span class="item-titulo">${escapar(t.tarea)}</span></div>
       <span class="item-meta">${t.hecha ? 'Entregada' : 'Pendiente'}</span></li>`).join('') + '</ul>';
  } else {
    html += '<p class="vacio">Sin entregas programadas este día.</p>';
  }
  contenedor.innerHTML = html;
  const botonManual = document.querySelector('#form-manual button[type=submit]');
  if (botonManual) botonManual.textContent = clave === claveFecha() ? 'Registrar hoy' : 'Registrar ese día';
}

$('btn-mes-anterior').addEventListener('click', () => { fechaActual.setMonth(fechaActual.getMonth() - 1); renderizarCalendario(); });
$('btn-mes-siguiente').addEventListener('click', () => { fechaActual.setMonth(fechaActual.getMonth() + 1); renderizarCalendario(); });
$('btn-hoy').addEventListener('click', () => { fechaActual = new Date(); diaSeleccionado = claveFecha(); renderizarCalendario(); });

/* ---------- 3.b RACHA DE ESTUDIO ---------- */
function diasConEstudio() {
  const min = minutosPorDia();
  return new Set(Object.keys(min).filter(k => min[k] > 0));
}

function calcularRacha() {
  const dias = diasConEstudio();
  const cursor = new Date();
  // Si hoy aún no registras nada, la racha sigue viva hasta el final del día.
  if (!dias.has(claveFecha(cursor))) cursor.setDate(cursor.getDate() - 1);
  let actual = 0;
  while (dias.has(claveFecha(cursor))) { actual++; cursor.setDate(cursor.getDate() - 1); }

  // Mejor marca histórica
  const ordenados = [...dias].sort();
  let mejor = 0, seguidos = 0, previo = null;
  ordenados.forEach(d => {
    if (previo) {
      const [a, m, x] = previo.split('-').map(Number);
      const siguiente = new Date(a, m - 1, x + 1);
      seguidos = claveFecha(siguiente) === d ? seguidos + 1 : 1;
    } else seguidos = 1;
    mejor = Math.max(mejor, seguidos);
    previo = d;
  });
  return { actual, mejor, hoy: dias.has(claveFecha()) };
}

function pintarRacha() {
  const { actual, mejor, hoy } = calcularRacha();
  $('racha-numero').textContent = actual;
  const texto = $('racha-texto');

  if (actual === 0) {
    texto.innerHTML = 'Registra estudio hoy y arranca tu racha.';
  } else if (hoy) {
    texto.innerHTML = `<strong>días seguidos estudiando.</strong> Hoy ya está marcado. Mejor marca: ${mejor} días.`;
  } else {
    texto.innerHTML = `<strong>días seguidos.</strong> Hoy todavía no registras nada: no la pierdas. Mejor marca: ${mejor} días.`;
  }
  DB.guardar('mejorRacha', mejor);
}

/* ---------- 3.c REGISTRO MANUAL (sin cronómetro) ---------- */
function registrarActividad(dia, nombre, categoria, minutos) {
  minutos = Math.max(1, Math.round(Number(minutos) || 0));
  const sesiones = DB.leer('sesiones', []);
  sesiones.unshift({
    id: idNuevo(), dia, nombre, categoria, minutos, manual: true,
    hora: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  });
  DB.guardar('sesiones', sesiones.slice(0, 400));

  const acumulados = minutosPorDia();
  acumulados[dia] = (acumulados[dia] || 0) + minutos;
  DB.guardar('minutos', acumulados);

  renderizarCalendario();
  pintarSesiones();
  pintarRacha();
  avisar(`Registrado: ${nombre} (${minutos} min).`, 'ok');
}

$('form-manual').addEventListener('submit', e => {
  e.preventDefault();
  registrarActividad(
    diaSeleccionado,
    $('manual-nombre').value.trim(),
    $('manual-categoria').value,
    $('manual-minutos').value
  );
  $('manual-nombre').value = '';
});

document.querySelectorAll('.chip-rapido').forEach(chip => {
  chip.addEventListener('click', () => {
    const nombre = $('manual-nombre').value.trim() || chip.dataset.cat;
    registrarActividad(diaSeleccionado, nombre, chip.dataset.cat, chip.dataset.min);
    $('manual-nombre').value = '';
  });
});

/* ---------- 4. APUNTES ---------- */
const blocNotas = $('bloc-notas');
let temporizadorNota;

blocNotas.value = DB.leer('nota', '');
actualizarConteoPalabras();

blocNotas.addEventListener('input', () => {
  actualizarConteoPalabras();
  $('estado-nota').textContent = 'Escribiendo…';
  $('estado-nota').classList.remove('guardado');
  clearTimeout(temporizadorNota);
  temporizadorNota = setTimeout(guardarNota, 900); // autoguardado
});

function guardarNota() {
  DB.guardar('nota', blocNotas.value);
  $('estado-nota').textContent = 'Guardado automáticamente';
  $('estado-nota').classList.add('guardado');
}

function actualizarConteoPalabras() {
  const palabras = blocNotas.value.trim().split(/\s+/).filter(Boolean).length;
  $('conteo-palabras').textContent = `${palabras} palabra${palabras === 1 ? '' : 's'}`;
}

$('btn-guardar-nota').addEventListener('click', () => { guardarNota(); avisar('Apuntes guardados.', 'ok'); });
$('btn-exportar-nota').addEventListener('click', () => descargar(`apuntes-${claveFecha()}.txt`, blocNotas.value));
$('btn-exportar-md').addEventListener('click', () =>
  descargar(`apuntes-${claveFecha()}.md`, `# Apuntes — ${claveFecha()}\n\n${blocNotas.value}`, 'text/markdown'));

/* ---------- 5. VISOR DE PDF (pdf.js) ---------- */
let pdfDoc = null, paginaActual = 1, escala = 1.2;

$('subir-pdf-visor').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (typeof pdfjsLib === 'undefined') {
    avisar('La librería de PDF no cargó. Conéctate una vez a internet para guardarla en caché.', 'error');
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  try {
    const datos = await archivo.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: datos }).promise;
    paginaActual = 1;
    $('nav-pdf').hidden = false;
    renderizarPagina();
  } catch (err) {
    avisar('No se pudo abrir el PDF.', 'error');
  }
});

async function renderizarPagina() {
  if (!pdfDoc) return;
  const pagina = await pdfDoc.getPage(paginaActual);
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const cont = $('contenedor-canvas-pdf');
  cont.innerHTML = '';
  cont.appendChild(canvas);
  $('pdf-pagina').textContent = `${paginaActual} / ${pdfDoc.numPages}`;
}

$('pdf-prev').addEventListener('click', () => { if (paginaActual > 1) { paginaActual--; renderizarPagina(); } });
$('pdf-next').addEventListener('click', () => { if (pdfDoc && paginaActual < pdfDoc.numPages) { paginaActual++; renderizarPagina(); } });
$('pdf-zoom-mas').addEventListener('click', () => { escala = Math.min(escala + 0.2, 3); renderizarPagina(); });
$('pdf-zoom-menos').addEventListener('click', () => { escala = Math.max(escala - 0.2, 0.6); renderizarPagina(); });

$('pdf-copiar-texto').addEventListener('click', async () => {
  if (!pdfDoc) return;
  const pagina = await pdfDoc.getPage(paginaActual);
  const contenido = await pagina.getTextContent();
  const texto = contenido.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  blocNotas.value += `\n\n--- Página ${paginaActual} ---\n${texto}`;
  guardarNota();
  actualizarConteoPalabras();
  avisar('Texto de la página añadido a tus apuntes.', 'ok');
});

/* ---------- 6. TEMPORIZADOR CON PERSISTENCIA ---------- */
let cronometro = DB.leer('cronometro', { activo: false, inicio: null, acumulado: 0, nombre: '', categoria: '', meta: 25 });
let intervalo = null, avisoMetaDado = false;

function segundosActuales() {
  let total = cronometro.acumulado;
  if (cronometro.activo && cronometro.inicio) total += (Date.now() - cronometro.inicio) / 1000;
  return Math.floor(total);
}

function formatearHMS(seg) {
  const h = String(Math.floor(seg / 3600)).padStart(2, '0');
  const m = String(Math.floor((seg % 3600) / 60)).padStart(2, '0');
  const s = String(seg % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function pintarCronometro() {
  const seg = segundosActuales();
  $('display-timer').textContent = formatearHMS(seg);
  $('display-timer').classList.toggle('corriendo', cronometro.activo);
  $('timer-etiqueta').textContent = cronometro.nombre
    ? `${cronometro.categoria}: ${cronometro.nombre}${cronometro.activo ? '' : ' (en pausa)'}`
    : 'Sin sesión activa';

  if (cronometro.activo && !avisoMetaDado && cronometro.meta && seg >= cronometro.meta * 60) {
    avisoMetaDado = true;
    notificar('Meta cumplida', `Llevas ${cronometro.meta} minutos en "${cronometro.nombre}". Levántate y estira.`);
    avisar('Meta de tiempo alcanzada. Toma una pausa activa.', 'ok');
  }
}

function arrancarBucle() {
  clearInterval(intervalo);
  intervalo = setInterval(pintarCronometro, 500);
}

function estadoBotones() {
  $('btn-timer-start').disabled = cronometro.activo;
  $('btn-timer-pause').disabled = !cronometro.activo;
  $('btn-timer-stop').disabled = !cronometro.activo && cronometro.acumulado === 0;
}

$('btn-timer-start').addEventListener('click', () => {
  const nombre = $('input-actividad-nombre').value.trim();
  if (!nombre) { avisar('Escribe qué vas a hacer antes de iniciar.', 'error'); $('input-actividad-nombre').focus(); return; }
  cronometro.activo = true;
  cronometro.inicio = Date.now();
  cronometro.nombre = nombre;
  cronometro.categoria = $('input-actividad-categoria').value;
  cronometro.meta = Number($('input-meta-min').value) || 0;
  DB.guardar('cronometro', cronometro);
  arrancarBucle(); pintarCronometro(); estadoBotones();
});

$('btn-timer-pause').addEventListener('click', () => {
  if (!cronometro.activo) return;
  cronometro.acumulado = segundosActuales();
  cronometro.activo = false;
  cronometro.inicio = null;
  DB.guardar('cronometro', cronometro);
  clearInterval(intervalo); pintarCronometro(); estadoBotones();
});

$('btn-timer-stop').addEventListener('click', () => {
  const seg = segundosActuales();
  if (seg < 5) { avisar('La sesión es demasiado corta para guardarla.', 'error'); return; }
  const minutos = Math.max(1, Math.round(seg / 60));
  const dia = claveFecha();

  const sesiones = DB.leer('sesiones', []);
  sesiones.unshift({
    id: idNuevo(), dia, nombre: cronometro.nombre, categoria: cronometro.categoria,
    minutos, hora: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  });
  DB.guardar('sesiones', sesiones.slice(0, 300));

  const acumulados = minutosPorDia();
  acumulados[dia] = (acumulados[dia] || 0) + minutos;
  DB.guardar('minutos', acumulados);

  cronometro = { activo: false, inicio: null, acumulado: 0, nombre: '', categoria: '', meta: cronometro.meta };
  avisoMetaDado = false;
  DB.guardar('cronometro', cronometro);
  clearInterval(intervalo);
  pintarCronometro(); estadoBotones(); pintarSesiones(); renderizarCalendario(); pintarRacha();
  $('form-actividad').reset();
  $('input-meta-min').value = 25;
  avisar(`Sesión guardada: ${minutos} min.`, 'ok');
});

function pintarSesiones() {
  const lista = $('lista-actividades');
  const hoy = claveFecha();
  const sesiones = DB.leer('sesiones', []).filter(s => s.dia === hoy);
  const total = sesiones.reduce((a, s) => a + s.minutos, 0);
  $('total-hoy').textContent = total >= 60
    ? `${Math.floor(total / 60)} h ${total % 60} min`
    : `${total} min`;

  if (!sesiones.length) {
    lista.innerHTML = '<li class="vacio">Aún no registras sesiones hoy. Inicia el cronómetro arriba.</li>';
    return;
  }
  lista.innerHTML = '';
  sesiones.forEach(s => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-info">
        <span class="item-materia">${escapar(s.categoria)}</span>
        <span class="item-titulo">${escapar(s.nombre)}</span>
        <span class="item-meta">${s.minutos} min · ${escapar(s.hora)}</span>
      </div>`;
    const del = document.createElement('button');
    del.className = 'mini-btn del'; del.type = 'button'; del.textContent = '✕';
    del.onclick = () => {
      const todas = DB.leer('sesiones', []).filter(x => x.id !== s.id);
      DB.guardar('sesiones', todas);
      const min = minutosPorDia();
      min[s.dia] = Math.max(0, (min[s.dia] || 0) - s.minutos);
      DB.guardar('minutos', min);
      pintarSesiones(); renderizarCalendario(); pintarRacha();
    };
    li.appendChild(del);
    lista.appendChild(li);
  });
}

if (cronometro.activo || cronometro.acumulado > 0) {
  $('input-actividad-nombre').value = cronometro.nombre;
  $('input-actividad-categoria').value = cronometro.categoria || 'Estudio';
  $('input-meta-min').value = cronometro.meta || 25;
  if (cronometro.activo) arrancarBucle();
}

/* ---------- 7. FICHAS DE ESTUDIO ---------- */
let fichas = DB.leer('fichas', []);

function pintarFichas() {
  const grid = $('grid-flashcards');
  if (!fichas.length) {
    grid.innerHTML = '<p class="vacio">Crea tu primera ficha con el formulario de arriba.</p>';
    return;
  }
  grid.innerHTML = '';
  fichas.forEach(f => {
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.innerHTML = `
      <div class="flashcard-inner">
        <div class="cara">
          ${f.materia ? `<span class="etiqueta-materia">${escapar(f.materia)}</span>` : ''}
          <span>${escapar(f.pregunta)}</span>
        </div>
        <div class="cara cara-atras"><span>${escapar(f.respuesta)}</span></div>
      </div>`;

    const voltear = () => card.classList.toggle('volteada');
    card.addEventListener('click', voltear);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); voltear(); } });

    const del = document.createElement('button');
    del.className = 'borrar-ficha'; del.type = 'button'; del.textContent = '✕';
    del.title = 'Eliminar ficha';
    del.onclick = (e) => {
      e.stopPropagation();
      fichas = fichas.filter(x => x.id !== f.id);
      DB.guardar('fichas', fichas); pintarFichas();
    };
    card.appendChild(del);
    grid.appendChild(card);
  });
}

$('form-flashcard').addEventListener('submit', e => {
  e.preventDefault();
  fichas.push({
    id: idNuevo(),
    materia: $('fc-materia').value.trim(),
    pregunta: $('fc-pregunta').value.trim(),
    respuesta: $('fc-respuesta').value.trim()
  });
  DB.guardar('fichas', fichas);
  pintarFichas();
  e.target.reset();
  avisar('Ficha añadida.', 'ok');
});

$('btn-mezclar').addEventListener('click', () => {
  for (let i = fichas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fichas[i], fichas[j]] = [fichas[j], fichas[i]];
  }
  DB.guardar('fichas', fichas); pintarFichas();
});

$('btn-voltear-todas').addEventListener('click', (e) => {
  const cartas = document.querySelectorAll('.flashcard');
  const mostrar = e.target.textContent.includes('Mostrar');
  cartas.forEach(c => c.classList.toggle('volteada', mostrar));
  e.target.textContent = mostrar ? 'Ocultar respuestas' : 'Mostrar respuestas';
});

/* ---------- 8. QR ---------- */
$('btn-generar-qr').addEventListener('click', () => {
  const texto = $('texto-qr').value.trim();
  const caja = $('qrcode');
  caja.innerHTML = '';
  if (!texto) { avisar('Escribe algo para convertir en QR.', 'error'); return; }
  if (texto.length > 900) { avisar('El texto es muy largo para un QR. Usa menos de 900 caracteres.', 'error'); return; }
  if (typeof QRCode === 'undefined') { avisar('La librería de QR no cargó.', 'error'); return; }
  new QRCode(caja, { text: texto, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
});

$('btn-qr-desde-notas').addEventListener('click', () => {
  $('texto-qr').value = blocNotas.value.slice(0, 900);
  $('btn-generar-qr').click();
});

let escaner = null;

$('btn-escanear').addEventListener('click', async () => {
  if (escaner) { detenerEscaner(); return; }
  if (typeof Html5Qrcode === 'undefined') { avisar('La librería del escáner no cargó.', 'error'); return; }
  try {
    escaner = new Html5Qrcode('reader');
    await escaner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (texto) => {
      $('resultado-qr').textContent = texto;
      $('btn-copiar-qr').hidden = false;
      detenerEscaner();
      avisar('Código leído.', 'ok');
    }, () => {});
    $('btn-escanear').textContent = 'Apagar cámara';
  } catch (err) {
    avisar('No se pudo abrir la cámara. Revisa los permisos del navegador.', 'error');
    escaner = null;
  }
});

function detenerEscaner() {
  if (!escaner) return;
  escaner.stop().then(() => escaner.clear()).catch(() => {}).finally(() => {
    escaner = null;
    $('btn-escanear').textContent = 'Encender cámara';
  });
}

$('btn-copiar-qr').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('resultado-qr').textContent);
    avisar('Copiado al portapapeles.', 'ok');
  } catch { avisar('Copia manualmente el texto.', 'error'); }
});

/* ---------- 9. MÚSICA ---------- */
const LOFI_POR_DEFECTO = 'https://open.spotify.com/embed/playlist/37i9dQZF1DX8U21A1snP82';

function convertirAEmbed(url) {
  url = url.trim();
  const iframe = url.match(/src="([^"]+)"/i);
  if (iframe) return iframe[1];
  if (url.includes('open.spotify.com') && !url.includes('/embed/'))
    return url.replace('open.spotify.com/', 'open.spotify.com/embed/').split('?')[0];
  const yt = url.match(/[?&]v=([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const corto = url.match(/youtu\.be\/([\w-]{11})/);
  if (corto) return `https://www.youtube.com/embed/${corto[1]}`;
  const playlist = url.match(/[?&]list=([\w-]+)/);
  if (playlist) return `https://www.youtube.com/embed/videoseries?list=${playlist[1]}`;
  return url;
}

function cargarMusica(url) {
  $('iframe-player').src = url;
  DB.guardar('musica', url);
}

$('btn-guardar-musica').addEventListener('click', () => {
  const url = $('input-url-musica').value;
  if (!url.trim()) { avisar('Pega primero un enlace.', 'error'); return; }
  const embed = convertirAEmbed(url);
  if (!/^https:\/\//.test(embed)) { avisar('El enlace debe empezar por https://', 'error'); return; }
  cargarMusica(embed);
  avisar('Reproductor cargado.', 'ok');
});

$('btn-restaurar-musica').addEventListener('click', () => {
  $('input-url-musica').value = '';
  cargarMusica(LOFI_POR_DEFECTO);
});

(function restaurarMusica() {
  const guardada = DB.leer('musica', null);
  if (guardada) $('iframe-player').src = guardada;
})();

/* ---------- 10. FONDO PERSONALIZADO ---------- */
const modalFondo = $('modal-fondo');

function aplicarFondo() {
  const url = DB.leer('fondo', '');
  const brillo = DB.leer('brillo', 70);
  $('bg-overlay').style.backgroundImage = url ? `url("${url}")` : 'none';
  document.documentElement.style.setProperty('--brillo-fondo', brillo / 100);
  $('input-url-fondo').value = url.startsWith('data:') ? '' : url;
  $('input-brillo').value = brillo;
  $('valor-brillo').textContent = brillo + '%';

  const previa = $('previsualizacion-fondo');
  previa.style.display = url ? 'block' : 'none';
  previa.style.backgroundImage = url ? `url("${url}")` : 'none';
}

/* Reduce la imagen antes de guardarla: localStorage solo aguanta ~5 MB. */
function comprimirImagen(archivo, anchoMax = 1600, calidad = 0.72) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, anchoMax / img.width);
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolver(lienzo.toDataURL('image/jpeg', calidad));
      };
      img.onerror = rechazar;
      img.src = lector.result;
    };
    lector.onerror = rechazar;
    lector.readAsDataURL(archivo);
  });
}

$('input-archivo-fondo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  // Los GIF pierden la animación al comprimirse, así que se guardan tal cual si son livianos.
  const esGif = archivo.type === 'image/gif';
  if (esGif && archivo.size > 2 * 1024 * 1024) {
    avisar('Ese GIF pesa demasiado. Usa uno de menos de 2 MB o pega su enlace.', 'error');
    e.target.value = ''; return;
  }

  try {
    const datos = esGif ? await leerComoDataURL(archivo) : await comprimirImagen(archivo);
    if (!DB.guardar('fondo', datos)) { e.target.value = ''; return; }
    DB.guardar('brillo', Number($('input-brillo').value));
    aplicarFondo();
    avisar('Fondo aplicado desde tu equipo.', 'ok');
  } catch {
    avisar('No se pudo leer esa imagen.', 'error');
  }
  e.target.value = '';
});

$('btn-config-fondo').addEventListener('click', () => modalFondo.classList.add('abierto'));
$('btn-cerrar-modal').addEventListener('click', () => modalFondo.classList.remove('abierto'));
$('input-brillo').addEventListener('input', e => {
  $('valor-brillo').textContent = e.target.value + '%';
  document.documentElement.style.setProperty('--brillo-fondo', e.target.value / 100);
});
$('btn-aplicar-fondo').addEventListener('click', () => {
  const url = $('input-url-fondo').value.trim();
  if (url && !/^https?:\/\//.test(url)) { avisar('La dirección debe empezar por http:// o https://', 'error'); return; }
  DB.guardar('fondo', url);
  DB.guardar('brillo', Number($('input-brillo').value));
  aplicarFondo();
  modalFondo.classList.remove('abierto');
  avisar('Fondo actualizado.', 'ok');
});
$('btn-restaurar-fondo').addEventListener('click', () => {
  DB.guardar('fondo', ''); DB.guardar('brillo', 70); aplicarFondo();
});

/* ---------- 11. NOTIFICACIONES ---------- */
function notificar(titulo, cuerpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(titulo, { body: cuerpo, icon: 'icon-192.png' }); } catch (e) {}
}

$('btn-notificaciones').addEventListener('click', async () => {
  if (!('Notification' in window)) { avisar('Este navegador no admite notificaciones.', 'error'); return; }
  const permiso = await Notification.requestPermission();
  if (permiso === 'granted') {
    avisar('Avisos activados.', 'ok');
    notificar('Mi Espacio de Estudio', 'Te avisaré de tus entregas y pausas.');
  } else {
    avisar('No diste permiso para los avisos.', 'error');
  }
});

function recordatorioDiario() {
  if (DB.leer('ultimoAviso', '') === claveFecha()) return;
  const proximas = tareas.filter(t => !t.hecha && diasRestantes(t.fecha) <= 3);
  if (proximas.length) {
    notificar('Entregas cerca', `Tienes ${proximas.length} entrega(s) en los próximos 3 días.`);
    avisar(`Tienes ${proximas.length} entrega(s) en los próximos 3 días.`);
  }
  DB.guardar('ultimoAviso', claveFecha());
}

/* ---------- 12. COPIA DE SEGURIDAD ---------- */
const modalBackup = $('modal-backup');

$('btn-backup').addEventListener('click', () => {
  let bytes = 0;
  for (const k in localStorage) if (k.startsWith(PREFIJO)) bytes += localStorage[k].length;
  $('uso-espacio').textContent = `Espacio usado: ${(bytes / 1024).toFixed(0)} KB de unos 5000 KB disponibles.`;
  modalBackup.classList.add('abierto');
});
$('btn-cerrar-backup').addEventListener('click', () => modalBackup.classList.remove('abierto'));

$('btn-exportar-datos').addEventListener('click', () => {
  const datos = {};
  for (const k in localStorage) if (k.startsWith(PREFIJO)) datos[k] = localStorage[k];
  descargar(`respaldo-estudio-${claveFecha()}.json`, JSON.stringify(datos, null, 2), 'application/json');
});

$('input-importar-datos').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (!confirm('Esto reemplazará los datos actuales de la aplicación. ¿Continuar?')) { e.target.value = ''; return; }
  try {
    const datos = JSON.parse(await archivo.text());
    Object.entries(datos).forEach(([k, v]) => { if (k.startsWith(PREFIJO)) localStorage.setItem(k, v); });
    avisar('Respaldo restaurado. Recargando…', 'ok');
    setTimeout(() => location.reload(), 1200);
  } catch {
    avisar('El archivo no es un respaldo válido.', 'error');
  }
});

document.querySelectorAll('.modal').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('abierto'); }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.abierto').forEach(m => m.classList.remove('abierto'));
});

/* ---------- 13. MASCOTA ---------- */
const frases = [
  'Media hora enfocada vale más que tres distraído.',
  '¿Ya revisaste la rúbrica de la entrega?',
  'Guarda un respaldo de vez en cuando.',
  'Hidrátate y estira la espalda.',
  'Una ficha nueva por cada concepto que no entiendas.',
  'Empieza por lo que vence primero.'
];

const mascota = $('mascota-flotante');
const bocadillo = $('mascota-bocadillo');

function hablarMascota(texto) {
  bocadillo.textContent = texto;
  bocadillo.hidden = false;
  clearTimeout(hablarMascota.t);
  hablarMascota.t = setTimeout(() => { bocadillo.hidden = true; }, 6000);
}

mascota.addEventListener('click', () => {
  const pendiente = tareas.filter(t => !t.hecha).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (pendiente && Math.random() > 0.4) {
    hablarMascota(`Lo más próximo: ${pendiente.tarea} (${pendiente.fecha}).`);
  } else {
    hablarMascota(frases[Math.floor(Math.random() * frases.length)]);
  }
});
setTimeout(() => { bocadillo.hidden = true; }, 5000);
setInterval(() => { if (document.visibilityState === 'visible') hablarMascota(frases[Math.floor(Math.random() * frases.length)]); }, 15 * 60 * 1000);

/* ---------- 14. ARRANQUE ---------- */
(function inicio() {
  const hora = new Date().getHours();
  $('saludo').textContent = hora < 12 ? 'Buenos días. ¿Con qué empezamos?'
    : hora < 19 ? 'Buenas tardes. Vamos por la siguiente entrega.'
    : 'Buenas noches. Sesión corta y a descansar.';

  $('input-fecha').min = claveFecha();
  pintarSemestres();
  actualizarMaterias();
  pintarTareas();
  renderizarCalendario();
  pintarSesiones();
  pintarFichas();
  pintarCronometro();
  estadoBotones();
  pintarRacha();
  aplicarFondo();
  recordatorioDiario();
})();

window.addEventListener('beforeunload', () => { if (blocNotas.value !== DB.leer('nota', '')) guardarNota(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
