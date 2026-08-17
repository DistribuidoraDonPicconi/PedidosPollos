const SPREADSHEET_ID = '1jfQwYsUbLSbHD5lfAV43SzQ2KRilM-Emy4CJQxeKGzk';

const HOJA_PEDIDOS = 'Pedidos';
const HOJA_CHOFERES = 'Choferes';

// Mismo Client ID que en CONFIG.GOOGLE_CLIENT_ID del index.html
const GOOGLE_CLIENT_ID = '922655936984-eb35rn1hu1855l6b4939qvvl286h7l10.apps.googleusercontent.com';

// Emails de Google autorizados a entrar a la app.
const EMAILS_AUTORIZADOS = [
  'nicolaspicconi@gmail.com',
  'distribuidoradonpicconi@gmail.com',
];

// Códigos de producto tal cual van en los encabezados de la hoja.
// Cambiá los "label" en index.html (CONFIG.PRODUCTOS) para que se
// vean con nombre completo en el formulario; acá dejalos como están,
// tienen que matchear los encabezados de la columna.
const CODIGOS_PRODUCTO = ['POLLO','UNID','CTO','FM','ALA','FP','FB','PE','MEN','MO','CAR','MED','FOR','TIR'];

const COLUMNAS_PEDIDOS = ['Cliente','Reparto','Localidad','Contacto'].concat(CODIGOS_PRODUCTO).concat(['Estado']);
const COLUMNAS_CHOFERES = ['Reparto','Chofer','WhatsApp'];

// ============== LOGIN CON GOOGLE ==============
function verificarLogin_(idToken) {
  if (!idToken) throw new Error('No autenticado. Iniciá sesión con Google.');

  const resp = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) {
    throw new Error('Sesión inválida o vencida. Volvé a iniciar sesión.');
  }

  const datos = JSON.parse(resp.getContentText());
  if (datos.aud !== GOOGLE_CLIENT_ID) {
    throw new Error('Token de Google no corresponde a esta app.');
  }
  if (datos.email_verified !== 'true' && datos.email_verified !== true) {
    throw new Error('El email de Google no está verificado.');
  }
  const email = String(datos.email || '').trim().toLowerCase();
  const autorizado = EMAILS_AUTORIZADOS.map(e => String(e).toLowerCase().trim());
  if (autorizado.indexOf(email) === -1) {
    throw new Error('Tu cuenta (' + email + ') no tiene acceso a esta app.');
  }
  return { email: email };
}
// ================================================

function probarPermisos(){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Hoja Pedidos
  const hojaPed = ss.getSheetByName(HOJA_PEDIDOS);
  if (!hojaPed) {
    Logger.log('ERROR: no se encontró la hoja "' + HOJA_PEDIDOS + '"');
  } else {
    Logger.log('Pedidos OK: ' + hojaPed.getName());
  }
  
  // Hoja Choferes
  const hojaChoferes = ss.getSheetByName(HOJA_CHOFERES);
  if (!hojaChoferes) {
    Logger.log('ERROR: no se encontró la hoja "' + HOJA_CHOFERES + '"');
  } else {
    Logger.log('Choferes OK: ' + hojaChoferes.getName());
  }
  
  UrlFetchApp.fetch('https://www.google.com');
  Logger.log('OK');
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// Devuelve la hoja pedida, creándola (con sus encabezados) si todavía
// no existe.
function getHoja_(nombre, columnas) {
  const ss = getSpreadsheet_();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
  }
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]);
  }
  return hoja;
}

function hojaAObjetos_(hoja) {
  const valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return [];
  const encabezados = valores[0];
  return valores.slice(1)
    .filter(fila => fila.some(v => v !== '' && v !== null))
    .map(fila => {
      const obj = {};
      encabezados.forEach((h, i) => obj[h] = fila[i]);
      return obj;
    });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function filaSegunEncabezados_(encabezados, datosPorCampo) {
  return encabezados.map(h => (h in datosPorCampo) ? datosPorCampo[h] : '');
}

// Inversa de filaSegunEncabezados_: arma un objeto {header: valor} a partir
// de una fila de valores. Se usa para devolverle al cliente la fila recién
// guardada sin tener que releer toda la hoja (mismo patrón que la app de
// Saldos, que es la que sincroniza rápido).
function objetoSegunEncabezados_(encabezados, fila) {
  const obj = {};
  encabezados.forEach((h, i) => obj[h] = fila[i]);
  return obj;
}

function buscarFilaCliente_(valores, idxCliente, cliente) {
  const buscado = String(cliente || '').trim().toLowerCase();
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][idxCliente] || '').trim().toLowerCase() === buscado) return i;
  }
  return -1;
}

function doGet(e) {
  try {
    verificarLogin_(e.parameter.token);
    const hojaPed = getHoja_(HOJA_PEDIDOS, COLUMNAS_PEDIDOS);
    const hojaChof = getHoja_(HOJA_CHOFERES, COLUMNAS_CHOFERES);
    return jsonResponse_({
      pedidos: hojaAObjetos_(hojaPed),
      repartos: hojaAObjetos_(hojaChof)
    });
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    verificarLogin_(payload.token);
    let resultado;
    if (payload.accion === 'eliminarCliente') {
      resultado = conLock_(() => eliminarCliente_(payload.cliente));
    } else if (payload.accion === 'guardarCantidades') {
      resultado = conLock_(() => guardarCantidades_(payload));
    } else if (payload.accion === 'vaciarCantidades') {
      resultado = conLock_(() => vaciarCantidades_());
    } else if (payload.accion === 'marcarEnviados') {
      resultado = conLock_(() => marcarEnviados_(payload.clientes));
    } else if (payload.accion === 'guardarChofer') {
      resultado = conLock_(() => guardarChofer_(payload));
    } else if (payload.accion === 'eliminarChofer') {
      resultado = conLock_(() => eliminarChofer_(payload.reparto));
    } else {
      // accion === 'guardarCliente' (o sin accion, por defecto)
      resultado = conLock_(() => guardarCliente_(payload));
    }
    return jsonResponse_(resultado || { ok: true });
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

// Serializa las escrituras a la planilla para que dos guardados casi
// simultáneos no se pisen.
function conLock_(funcion) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('El sistema está ocupado guardando otro cambio. Probá de nuevo en unos segundos.');
  }
  try {
    return funcion();
  } finally {
    lock.releaseLock();
  }
}

// Crea un cliente nuevo, o edita uno existente (si viene nombreOriginal).
// Solo toca Cliente/Reparto/Localidad/Contacto; nunca pisa las
// cantidades cargadas ni el Estado.
function guardarCliente_(payload) {
  const hoja = getHoja_(HOJA_PEDIDOS, COLUMNAS_PEDIDOS);
  const nombreNuevo = String(payload.cliente || '').trim();
  const reparto = String(payload.reparto || '').trim();
  const localidad = String(payload.localidad || '').trim();
  const contacto = String(payload.contacto || '').trim();
  const nombreOriginal = String(payload.nombreOriginal || '').trim();

  if (!nombreNuevo) throw new Error('Falta el nombre del cliente');

  const valores = hoja.getDataRange().getValues();
  const encabezados = valores[0];
  const idxCliente = encabezados.indexOf('Cliente');
  const idxReparto = encabezados.indexOf('Reparto');
  const idxLocalidad = encabezados.indexOf('Localidad');
  const idxContacto = encabezados.indexOf('Contacto');

  const filaConNombreNuevo = buscarFilaCliente_(valores, idxCliente, nombreNuevo);

  if (nombreOriginal) {
    // Editar cliente existente
    const filaIdx = buscarFilaCliente_(valores, idxCliente, nombreOriginal);
    if (filaIdx === -1) throw new Error('No se encontró el cliente a editar');
    if (filaConNombreNuevo !== -1 && filaConNombreNuevo !== filaIdx) {
      throw new Error('Ya existe otro cliente con ese nombre');
    }
    hoja.getRange(filaIdx + 1, idxCliente + 1).setValue(nombreNuevo);
    hoja.getRange(filaIdx + 1, idxReparto + 1).setValue(reparto);
    hoja.getRange(filaIdx + 1, idxLocalidad + 1).setValue(localidad);
    hoja.getRange(filaIdx + 1, idxContacto + 1).setValue(contacto);
    const filaGuardada = hoja.getRange(filaIdx + 1, 1, 1, encabezados.length).getValues()[0];
    return {
      ok: true,
      clienteGuardado: objetoSegunEncabezados_(encabezados, filaGuardada),
      nombreOriginal: nombreOriginal
    };
  } else {
    // Cliente nuevo
    if (filaConNombreNuevo !== -1) throw new Error('Ya existe un cliente con ese nombre');
    const fila = filaSegunEncabezados_(encabezados, {
      'Cliente': nombreNuevo, 'Reparto': reparto,
      'Localidad': localidad, 'Contacto': contacto
    });
    hoja.appendRow(fila);
    return {
      ok: true,
      clienteGuardado: objetoSegunEncabezados_(encabezados, fila),
      nombreOriginal: ''
    };
  }
}

function eliminarCliente_(nombreCliente) {
  const cliente = String(nombreCliente || '').trim();
  if (!cliente) throw new Error('Falta el cliente a eliminar');
  const hoja = getHoja_(HOJA_PEDIDOS, COLUMNAS_PEDIDOS);
  const valores = hoja.getDataRange().getValues();
  const idxCliente = valores[0].indexOf('Cliente');
  const filaIdx = buscarFilaCliente_(valores, idxCliente, cliente);
  if (filaIdx === -1) throw new Error('No se encontró el cliente a eliminar');
  hoja.deleteRow(filaIdx + 1);
  return { ok: true, clienteEliminado: cliente };
}

// Guarda las cantidades cargadas (y el Estado) de un cliente puntual.
function guardarCantidades_(payload) {
  const cliente = String(payload.cliente || '').trim();
  if (!cliente) throw new Error('Falta el cliente');
  const cantidades = payload.cantidades || {};

  const hoja = getHoja_(HOJA_PEDIDOS, COLUMNAS_PEDIDOS);
  const valores = hoja.getDataRange().getValues();
  const encabezados = valores[0];
  const idxCliente = encabezados.indexOf('Cliente');
  const filaIdx = buscarFilaCliente_(valores, idxCliente, cliente);
  if (filaIdx === -1) throw new Error('No se encontró el cliente');

  const idxInicio = encabezados.indexOf(CODIGOS_PRODUCTO[0]);
  const idxEstado = encabezados.indexOf('Estado');
  const numCols = idxEstado - idxInicio + 1;

  const nuevaFila = [];
  CODIGOS_PRODUCTO.forEach(codigo => {
    const v = cantidades[codigo];
    nuevaFila.push(v === undefined || v === null || v === '' ? '' : Number(v));
  });
  const estadoActual = valores[filaIdx][idxEstado];
  nuevaFila.push(payload.estado !== undefined ? payload.estado : estadoActual);

  hoja.getRange(filaIdx + 1, idxInicio + 1, 1, numCols).setValues([nuevaFila]);
  return { ok: true };
}

// Vacía TODAS las cantidades y el Estado de TODOS los clientes, para
// arrancar de cero el lunes/jueves. No borra ni la lista de clientes
// ni sus datos (Reparto/Localidad/Contacto).
function vaciarCantidades_() {
  const hoja = getHoja_(HOJA_PEDIDOS, COLUMNAS_PEDIDOS);
  const filas = hoja.getLastRow();
  if (filas < 2) return { ok: true };
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const idxInicio = encabezados.indexOf(CODIGOS_PRODUCTO[0]);
  const idxEstado = encabezados.indexOf('Estado');
  const numCols = idxEstado - idxInicio + 1;
  const numFilas = filas - 1;
  const vacio = [];
  for (let i = 0; i < numFilas; i++) vacio.push(new Array(numCols).fill(''));
  hoja.getRange(2, idxInicio + 1, numFilas, numCols).setValues(vacio);
  return { ok: true };
}

// Marca Estado = "Enviado" para la lista de clientes indicada (se usa
// después de generar y mandar el mensaje de WhatsApp de un reparto).
function marcarEnviados_(clientes) {
  if (!clientes || !clientes.length) return { ok: true };
  const hoja = getHoja_(HOJA_PEDIDOS, COLUMNAS_PEDIDOS);
  const valores = hoja.getDataRange().getValues();
  const encabezados = valores[0];
  const idxCliente = encabezados.indexOf('Cliente');
  const idxEstado = encabezados.indexOf('Estado');
  if (idxEstado === -1) return { ok: true };
  const set = clientes.map(c => String(c).trim().toLowerCase());
  for (let i = 1; i < valores.length; i++) {
    const nombre = String(valores[i][idxCliente] || '').trim().toLowerCase();
    if (set.indexOf(nombre) !== -1) {
      hoja.getRange(i + 1, idxEstado + 1).setValue('Enviado');
    }
  }
  return { ok: true };
}

function buscarFilaReparto_(valores, idxReparto, reparto) {
  const buscado = String(reparto || '').trim().toLowerCase();
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][idxReparto] || '').trim().toLowerCase() === buscado) return i;
  }
  return -1;
}

// Crea un chofer/reparto nuevo, o edita uno existente (si viene
// repartoOriginal). El "Reparto" es la clave: tiene que ser único.
function guardarChofer_(payload) {
  const hoja = getHoja_(HOJA_CHOFERES, COLUMNAS_CHOFERES);
  const repartoNuevo = String(payload.reparto || '').trim();
  const chofer = String(payload.chofer || '').trim();
  const whatsapp = String(payload.whatsapp || '').trim();
  const repartoOriginal = String(payload.repartoOriginal || '').trim();

  if (!repartoNuevo) throw new Error('Falta el nombre del reparto');
  if (!whatsapp) throw new Error('Falta el WhatsApp del chofer');

  const valores = hoja.getDataRange().getValues();
  const encabezados = valores[0];
  const idxReparto = encabezados.indexOf('Reparto');
  const idxChofer = encabezados.indexOf('Chofer');
  const idxWhatsapp = encabezados.indexOf('WhatsApp');

  const filaConRepartoNuevo = buscarFilaReparto_(valores, idxReparto, repartoNuevo);

  if (repartoOriginal) {
    const filaIdx = buscarFilaReparto_(valores, idxReparto, repartoOriginal);
    if (filaIdx === -1) throw new Error('No se encontró el reparto a editar');
    if (filaConRepartoNuevo !== -1 && filaConRepartoNuevo !== filaIdx) {
      throw new Error('Ya existe otro chofer cargado con ese Reparto');
    }
    hoja.getRange(filaIdx + 1, idxReparto + 1).setValue(repartoNuevo);
    hoja.getRange(filaIdx + 1, idxChofer + 1).setValue(chofer);
    hoja.getRange(filaIdx + 1, idxWhatsapp + 1).setValue(whatsapp);
    const filaGuardada = hoja.getRange(filaIdx + 1, 1, 1, encabezados.length).getValues()[0];
    return {
      ok: true,
      choferGuardado: objetoSegunEncabezados_(encabezados, filaGuardada),
      repartoOriginal: repartoOriginal
    };
  } else {
    if (filaConRepartoNuevo !== -1) throw new Error('Ya existe un chofer cargado para ese Reparto');
    const fila = filaSegunEncabezados_(encabezados, {
      'Reparto': repartoNuevo, 'Chofer': chofer, 'WhatsApp': whatsapp
    });
    hoja.appendRow(fila);
    return {
      ok: true,
      choferGuardado: objetoSegunEncabezados_(encabezados, fila),
      repartoOriginal: ''
    };
  }
}

function eliminarChofer_(reparto) {
  const buscado = String(reparto || '').trim();
  if (!buscado) throw new Error('Falta el reparto a eliminar');
  const hoja = getHoja_(HOJA_CHOFERES, COLUMNAS_CHOFERES);
  const valores = hoja.getDataRange().getValues();
  const idxReparto = valores[0].indexOf('Reparto');
  const filaIdx = buscarFilaReparto_(valores, idxReparto, buscado);
  if (filaIdx === -1) throw new Error('No se encontró el chofer a eliminar');
  hoja.deleteRow(filaIdx + 1);
  return { ok: true, repartoEliminado: buscado };
}

// Función de prueba: correla manualmente desde el editor de Apps
// Script (▶) para chequear que los permisos y el ID de la planilla
// estén bien antes de usar la app.
function probarPermisos() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojaPed = ss.getSheetByName(HOJA_PEDIDOS);
  Logger.log(hojaPed ? 'Pedidos OK' : 'Se creará la hoja Pedidos al primer uso');
  const hojaChof = ss.getSheetByName(HOJA_CHOFERES);
  Logger.log(hojaChof ? 'Choferes OK' : 'Se creará la hoja Choferes al primer uso');
  UrlFetchApp.fetch('https://www.google.com');
  Logger.log('Permisos OK');
}