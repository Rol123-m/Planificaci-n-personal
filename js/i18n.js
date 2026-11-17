/**
 * Planificación Personal — i18n.js
 * Multi-idioma simple (español / inglés) sin dependencias.
 * Uso:  import { t, applyI18n, setLocale } from './i18n.js';
 *       <span data-i18n="nav.hoy"></span>
 */

const DICT = {
  es: {
    'app.name': 'Planificación Personal',
    'app.tagline': 'Roles, semana, mes y metas. Funciona offline y sincroniza con Google Sheets.',

    'nav.hoy': 'Hoy', 'nav.semana': 'Semana', 'nav.mes': 'Mes', 'nav.roles': 'Roles',
    'nav.metas': 'Largo Plazo', 'nav.buscar': 'Buscar', 'nav.stats': 'Estadísticas',
    'nav.papelera': 'Papelera', 'nav.ajustes': 'Ajustes',

    'auth.subtitle': 'Roles, semana, mes y metas. Funciona offline y sincroniza con Google Sheets.',
    'auth.gisAria': 'Botón de inicio de sesión de Google',
    'auth.or': 'o',
    'auth.altTitle': 'Entrar con código de acceso',
    'auth.email': 'Tu correo', 'auth.name': 'Tu nombre', 'auth.code': 'Código de acceso',
    'auth.enter': 'Entrar / Registrarme', 'auth.demo': 'Probar demo sin cuenta (offline)',
    'auth.note': 'Al registrarte se crea automáticamente tu propia hoja de cálculo privada en Google Sheets.',
    'auth.error.gis': 'No se pudo iniciar sesión con Google. Verifica la configuración del ID de cliente.',
    'auth.loading': 'Cargando configuración…',

    'menu.forceSync': 'Sincronizar ahora', 'menu.backup': 'Respaldo JSON', 'menu.logout': 'Cerrar sesión',

    'banner.offline': 'Sin conexión — los cambios se guardan localmente y se subirán automáticamente.',
    'banner.demo': 'Modo demo: datos de ejemplo en tu dispositivo, sin sincronización.',

    'sync.online': 'Sincronizado', 'sync.offline': 'Sin conexión', 'sync.syncing': 'Sincronizando…',
    'sync.pending': 'pendientes de subir', 'sync.demo': 'Demo local',

    'common.add': 'Añadir', 'common.edit': 'Editar', 'common.delete': 'Eliminar', 'common.save': 'Guardar',
    'common.cancel': 'Cancelar', 'common.close': 'Cerrar', 'common.confirm': 'Confirmar',
    'common.search': 'Buscar', 'common.none': 'Nada por aquí todavía', 'common.today': 'Hoy',
    'common.prev': 'Anterior', 'common.next': 'Siguiente', 'common.all': 'Todos',
    'common.restore': 'Restaurar', 'common.purge': 'Borrar definitivamente', 'common.emptyTrash': 'Vaciar papelera',
    'common.yes': 'Sí', 'common.no': 'No', 'common.optional': 'opcional', 'common.task': 'tarea',
    'common.details': 'Detalles', 'common.deleteConfirm': '¿Enviar a la papelera?',
    'common.purgeConfirm': '¿Borrar definitivamente? Esta acción no se puede deshacer.',
    'common.actions': 'Acciones', 'common.select': 'Seleccionar', 'common.export': 'Exportar',
    'common.suggestions': 'Sugerencias', 'common.print': 'Imprimir / PDF', 'common.loading': 'Cargando…',

    'hoy.title': 'Hoy', 'hoy.overdue': 'Vencidas', 'hoy.scheduled': 'Programadas hoy',
    'hoy.nextReminder': 'Próximo recordatorio', 'hoy.focus': 'Modo enfoque (Pomodoro)',
    'hoy.completed': 'Completadas hoy', 'hoy.unscheduled': 'Tareas sin fecha',
    'hoy.startFocus': 'Iniciar enfoque', 'hoy.stopFocus': 'Detener', 'hoy.noTasks': 'Nada programado para hoy. ¡Buena jornada!',
    'hoy.reminderIn': 'en',

    'week.title': 'Semana', 'week.tray': 'Sin programar', 'week.trayHint': 'Arrastra una tarea a una franja horaria, o pulsa + para asignarla.',
    'week.weekOf': 'Semana del', 'week.addSlot': 'Añadir aquí', 'week.why': 'Por qué',
    'week.suggestFor': 'Sugerencias para', 'week.assign': 'Asignar', 'week.move': 'Mover a…',
    'week.noTasks': 'Sin tareas esta semana.', 'week.today': 'Hoy',

    'mes.title': 'Mes', 'mes.dayTasks': 'Tareas del día', 'mes.more': 'más',

    'roles.title': 'Roles', 'roles.new': 'Nuevo rol', 'roles.edit': 'Editar rol',
    'roles.name': 'Nombre', 'roles.color': 'Color', 'roles.icon': 'Icono (emoji)',
    'roles.desc': 'Descripción', 'roles.tasks': 'Tareas', 'roles.noTasks': 'Sin tareas en este rol.',
    'roles.addTask': 'Añadir tarea', 'roles.deleted': 'Rol eliminado', 'roles.count': 'tareas',

    'task.title': 'Tarea', 'task.new': 'Nueva tarea', 'task.edit': 'Editar tarea',
    'task.titulo': 'Título', 'task.desc': 'Descripción', 'task.fecha': 'Fecha',
    'task.horaInicio': 'Hora inicio', 'task.horaFin': 'Hora fin', 'task.duracion': 'Duración estimada (min)',
    'task.prioridad': 'Prioridad', 'task.estado': 'Estado', 'task.rol': 'Rol',
    'task.recordatorio': 'Recordatorio (campanita)', 'task.recordatorioOffset': 'Avisar antes',
    'task.telefono': 'Teléfono', 'task.email': 'Email', 'task.etiquetas': 'Etiquetas (separadas por comas)',
    'task.recurring': 'Repetir', 'task.recurring.none': 'No repetir', 'task.recurring.daily': 'Cada día',
    'task.recurring.weekly': 'Cada semana', 'task.recurring.monthly': 'Cada mes',
    'task.markDone': 'Marcar hecha', 'task.contact': 'Contacto', 'task.history': 'Historial',
    'task.deletedMsg': 'Tarea enviada a la papelera', 'task.nextCreated': 'Se creó la siguiente repetición',
    'task.priority.alta': 'Alta', 'task.priority.media': 'Media', 'task.priority.baja': 'Baja',
    'task.estado.pendiente': 'Pendiente', 'task.estado.en_curso': 'En curso', 'task.estado.hecha': 'Hecha',
    'task.noFecha': 'Sin fecha', 'task.timeAt': 'a las', 'task.neededTitle': 'El título es obligatorio',

    'metas.title': 'Funciones y objetivos a largo plazo', 'metas.new': 'Nueva meta',
    'metas.edit': 'Editar meta', 'metas.objetivo': 'Fecha objetivo', 'metas.progreso': 'Progreso',
    'metas.estado': 'Estado', 'metas.convert': 'Convertir en tareas', 'metas.convertHint': 'Crea tareas concretas dentro de un rol',
    'metas.convertBtn': 'Generar tareas', 'metas.convertPlace': 'Una tarea por línea, ej.: "Redactar borrador, 60 min"',
    'metas.created': 'tareas creadas',

    'buscar.title': 'Búsqueda global', 'buscar.text': 'Texto', 'buscar.role': 'Rol', 'buscar.state': 'Estado',
    'buscar.priority': 'Prioridad', 'buscar.tag': 'Etiqueta', 'buscar.from': 'Desde', 'buscar.to': 'Hasta',
    'buscar.results': 'resultados', 'buscar.clear': 'Limpiar filtros', 'buscar.selectMode': 'Selección múltiple',
    'buscar.exportSelected': 'Exportar seleccionadas (.ics)',

    'stats.title': 'Estadísticas', 'stats.weekDone': 'Completadas por semana (últimas 8)',
    'stats.monthDone': 'Completadas por mes', 'stats.timeByRole': 'Tiempo estimado por rol (tareas hechas)',
    'stats.byPriority': 'Tareas pendientes por prioridad', 'stats.totalDone': 'Tareas completadas',
    'stats.totalPending': 'Pendientes', 'stats.totalOverdue': 'Vencidas', 'stats.hours': 'h',

    'papelera.title': 'Papelera y archivado', 'papelera.empty': 'La papelera está vacía.',
    'papelera.restoreAll': 'Restaurar todo',

    'ajustes.title': 'Ajustes', 'ajustes.profile': 'Perfil', 'ajustes.appearance': 'Apariencia e idioma',
    'ajustes.theme': 'Tema', 'ajustes.themeLight': 'Claro', 'ajustes.themeDark': 'Oscuro', 'ajustes.themeAuto': 'Sistema',
    'ajustes.language': 'Idioma', 'ajustes.weekRange': 'Rango horario de la semana',
    'ajustes.notifications': 'Notificaciones y recordatorios',
    'ajustes.enableNotif': 'Permitir notificaciones', 'ajustes.notifState': 'Estado',
    'ajustes.emailReminders': 'Recordatorios por email (Apps Script)',
    'ajustes.data': 'Datos y respaldo', 'ajustes.exportJson': 'Exportar respaldo JSON',
    'ajustes.exportCsv': 'Exportar CSV', 'ajustes.importJson': 'Importar respaldo JSON',
    'ajustes.sync': 'Sincronización', 'ajustes.lastSync': 'Última sincronización', 'ajustes.never': 'nunca',
    'ajustes.forceNow': 'Forzar ahora', 'ajustes.conflicts': 'Conflictos pendientes',
    'ajustes.admin': 'Administración', 'ajustes.adminHint': 'Usuarios registrados (solo administrador)',
    'ajustes.about': 'Acerca de', 'ajustes.aboutText': 'PWA offline-first con Google Sheets como base de datos vía Apps Script.',
    'ajustes.clearLocal': 'Borrar datos locales', 'ajustes.dangerZone': 'Zona de riesgo',
    'ajustes.pomodoro': 'Pomodoro (min)', 'ajustes.focus': 'Enfoque', 'ajustes.rest': 'Descanso',

    'import.title': 'Importar', 'import.csv': 'Importar CSV', 'import.ics': 'Importar ICS / iCal',
    'import.pick': 'Elegir archivo', 'import.map': 'Mapeo de columnas', 'import.preview': 'Vista previa',
    'import.duplicates': 'Duplicados detectados', 'import.mode': 'Duplicados', 'import.mode.skip': 'Omitir',
    'import.mode.import': 'Importar igual', 'import.confirm': 'Importar seleccionadas', 'import.cancel': 'Cancelar importación',
    'import.imported': 'tareas importadas', 'import.noRows': 'No se encontraron filas importables.',
    'import.field': 'Campo', 'import.column': 'Columna del archivo', 'import.ignore': '(ignorar)',
    'import.encodingHint': 'El CSV puede usar , ; o tabulaciones como separador (se detecta automáticamente).',

    'export.title': 'Exportar', 'export.ics': 'Descargar .ics (Google / Outlook / Apple)',
    'export.gcalOne': 'Añadir a Google Calendar', 'export.outlook': 'Añadir a Outlook Web',
    'export.pdf': 'Exportar PDF (tabla imprimible)', 'export.csv': 'Exportar CSV', 'export.json': 'Exportar JSON',
    'export.range': 'Rango', 'export.day1': '1 día', 'export.day2': '2 días', 'export.day3': '3 días',
    'export.week': 'Semana completa', 'export.month': 'Mes', 'export.custom': 'Rango personalizado',
    'export.from': 'Desde', 'export.to': 'Hasta', 'export.generate': 'Generar', 'export.icsTip': 'Un archivo .ics se puede importar en Google Calendar, Outlook y Apple Calendar.',
    'export.printed': 'Generado por Planificación Personal',

    'notify.title': 'Notificaciones', 'notify.granted': 'Notificaciones activadas', 'notify.denied': 'Permisos denegados en este navegador',
    'notify.trayEmpty': 'Sin notificaciones todavía', 'notify.markAll': 'Marcar leídas',
    'notify.reminderBody': 'Recordatorio de tarea', 'notify.periodicHint': 'Con la app instalada (Chrome/Edge) también se revisan recordatorios en segundo plano.',

    'contact.call': 'Llamar', 'contact.whatsapp': 'WhatsApp', 'contact.email': 'Email',

    'sync.conflictTitle': 'Conflicto de sincronización', 'sync.conflictBody': 'La versión del servidor y la tuya difieren. ¿Cuál conservas?',
    'sync.keepMine': 'Conservar la mía', 'sync.keepServer': 'Conservar la del servidor', 'sync.keepBoth': 'Conservar ambas',
    'sync.resolved': 'Conflicto resuelto', 'sync.pulled': 'Cambios descargados', 'sync.pushed': 'Cambios subidos',

    'shortcuts.title': 'Atajos de teclado',
    'shortcuts.newTask': 'Nueva tarea', 'shortcuts.search': 'Buscar', 'shortcuts.go': 'Ir a Hoy / Semana / Mes / Roles / Largo plazo',
    'shortcuts.today': 'Volver a hoy / esta semana', 'shortcuts.help': 'Mostrar esta ayuda', 'shortcuts.close': 'Cerrar diálogo',

    'errors.offlineWrite': 'Estás sin conexión: el cambio se guardó y se subirá al recuperar internet.',
    'errors.api': 'Error del servidor', 'errors.network': 'No hay conexión con el servidor',
    'errors.auth': 'Sesión caducada. Vuelve a iniciar sesión.', 'errors.setup': 'El backend no está configurado aún. Revisa el README (setupSystem).'
  },

  en: {
    'app.name': 'Personal Planner',
    'app.tagline': 'Roles, week, month and goals. Works offline and syncs with Google Sheets.',

    'nav.hoy': 'Today', 'nav.semana': 'Week', 'nav.mes': 'Month', 'nav.roles': 'Roles',
    'nav.metas': 'Long Term', 'nav.buscar': 'Search', 'nav.stats': 'Statistics',
    'nav.papelera': 'Trash', 'nav.ajustes': 'Settings',

    'auth.subtitle': 'Roles, week, month and goals. Works offline and syncs with Google Sheets.',
    'auth.gisAria': 'Google sign-in button',
    'auth.or': 'or',
    'auth.altTitle': 'Sign in with access code',
    'auth.email': 'Your email', 'auth.name': 'Your name', 'auth.code': 'Access code',
    'auth.enter': 'Sign in / Register', 'auth.demo': 'Try demo without account (offline)',
    'auth.note': 'When you register, your own private Google Sheets spreadsheet is created automatically.',
    'auth.error.gis': 'Could not sign in with Google. Check the Client ID configuration.',
    'auth.loading': 'Loading configuration…',

    'menu.forceSync': 'Sync now', 'menu.backup': 'JSON backup', 'menu.logout': 'Sign out',

    'banner.offline': 'Offline — changes are saved locally and will upload automatically.',
    'banner.demo': 'Demo mode: sample data on your device, no sync.',

    'sync.online': 'Synced', 'sync.offline': 'Offline', 'sync.syncing': 'Syncing…',
    'sync.pending': 'pending upload', 'sync.demo': 'Local demo',

    'common.add': 'Add', 'common.edit': 'Edit', 'common.delete': 'Delete', 'common.save': 'Save',
    'common.cancel': 'Cancel', 'common.close': 'Close', 'common.confirm': 'Confirm',
    'common.search': 'Search', 'common.none': 'Nothing here yet', 'common.today': 'Today',
    'common.prev': 'Previous', 'common.next': 'Next', 'common.all': 'All',
    'common.restore': 'Restore', 'common.purge': 'Delete permanently', 'common.emptyTrash': 'Empty trash',
    'common.yes': 'Yes', 'common.no': 'No', 'common.optional': 'optional', 'common.task': 'task',
    'common.details': 'Details', 'common.deleteConfirm': 'Send to trash?',
    'common.purgeConfirm': 'Delete permanently? This cannot be undone.',
    'common.actions': 'Actions', 'common.select': 'Select', 'common.export': 'Export',
    'common.suggestions': 'Suggestions', 'common.print': 'Print / PDF', 'common.loading': 'Loading…',

    'hoy.title': 'Today', 'hoy.overdue': 'Overdue', 'hoy.scheduled': 'Scheduled today',
    'hoy.nextReminder': 'Next reminder', 'hoy.focus': 'Focus mode (Pomodoro)',
    'hoy.completed': 'Completed today', 'hoy.unscheduled': 'Tasks without date',
    'hoy.startFocus': 'Start focus', 'hoy.stopFocus': 'Stop', 'hoy.noTasks': 'Nothing scheduled today. Have a great day!',
    'hoy.reminderIn': 'in',

    'week.title': 'Week', 'week.tray': 'Unscheduled', 'week.trayHint': 'Drag a task to a time slot, or tap + to assign it.',
    'week.weekOf': 'Week of', 'week.addSlot': 'Add here', 'week.why': 'Why',
    'week.suggestFor': 'Suggestions for', 'week.assign': 'Assign', 'week.move': 'Move to…',
    'week.noTasks': 'No tasks this week.', 'week.today': 'Today',

    'mes.title': 'Month', 'mes.dayTasks': "Day's tasks", 'mes.more': 'more',

    'roles.title': 'Roles', 'roles.new': 'New role', 'roles.edit': 'Edit role',
    'roles.name': 'Name', 'roles.color': 'Color', 'roles.icon': 'Icon (emoji)',
    'roles.desc': 'Description', 'roles.tasks': 'Tasks', 'roles.noTasks': 'No tasks in this role.',
    'roles.addTask': 'Add task', 'roles.deleted': 'Role deleted', 'roles.count': 'tasks',

    'task.title': 'Task', 'task.new': 'New task', 'task.edit': 'Edit task',
    'task.titulo': 'Title', 'task.desc': 'Description', 'task.fecha': 'Date',
    'task.horaInicio': 'Start time', 'task.horaFin': 'End time', 'task.duracion': 'Estimated duration (min)',
    'task.prioridad': 'Priority', 'task.estado': 'Status', 'task.rol': 'Role',
    'task.recordatorio': 'Reminder (bell)', 'task.recordatorioOffset': 'Notify before',
    'task.telefono': 'Phone', 'task.email': 'Email', 'task.etiquetas': 'Tags (comma separated)',
    'task.recurring': 'Repeat', 'task.recurring.none': 'No repeat', 'task.recurring.daily': 'Daily',
    'task.recurring.weekly': 'Weekly', 'task.recurring.monthly': 'Monthly',
    'task.markDone': 'Mark done', 'task.contact': 'Contact', 'task.history': 'History',
    'task.deletedMsg': 'Task sent to trash', 'task.nextCreated': 'Next occurrence created',
    'task.priority.alta': 'High', 'task.priority.media': 'Medium', 'task.priority.baja': 'Low',
    'task.estado.pendiente': 'Pending', 'task.estado.en_curso': 'In progress', 'task.estado.hecha': 'Done',
    'task.noFecha': 'No date', 'task.timeAt': 'at', 'task.neededTitle': 'Title is required',

    'metas.title': 'Long term functions & goals', 'metas.new': 'New goal',
    'metas.edit': 'Edit goal', 'metas.objetivo': 'Target date', 'metas.progreso': 'Progress',
    'metas.estado': 'Status', 'metas.convert': 'Convert to tasks', 'metas.convertHint': 'Creates concrete tasks inside a role',
    'metas.convertBtn': 'Generate tasks', 'metas.convertPlace': 'One task per line, e.g.: "Write draft, 60 min"',
    'metas.created': 'tasks created',

    'buscar.title': 'Global search', 'buscar.text': 'Text', 'buscar.role': 'Role', 'buscar.state': 'Status',
    'buscar.priority': 'Priority', 'buscar.tag': 'Tag', 'buscar.from': 'From', 'buscar.to': 'To',
    'buscar.results': 'results', 'buscar.clear': 'Clear filters', 'buscar.selectMode': 'Multi-select',
    'buscar.exportSelected': 'Export selected (.ics)',

    'stats.title': 'Statistics', 'stats.weekDone': 'Completed per week (last 8)',
    'stats.monthDone': 'Completed per month', 'stats.timeByRole': 'Estimated time by role (done tasks)',
    'stats.byPriority': 'Pending tasks by priority', 'stats.totalDone': 'Tasks completed',
    'stats.totalPending': 'Pending', 'stats.totalOverdue': 'Overdue', 'stats.hours': 'h',

    'papelera.title': 'Trash & archive', 'papelera.empty': 'Trash is empty.',
    'papelera.restoreAll': 'Restore all',

    'ajustes.title': 'Settings', 'ajustes.profile': 'Profile', 'ajustes.appearance': 'Appearance & language',
    'ajustes.theme': 'Theme', 'ajustes.themeLight': 'Light', 'ajustes.themeDark': 'Dark', 'ajustes.themeAuto': 'System',
    'ajustes.language': 'Language', 'ajustes.weekRange': 'Week time range',
    'ajustes.notifications': 'Notifications & reminders',
    'ajustes.enableNotif': 'Allow notifications', 'ajustes.notifState': 'State',
    'ajustes.emailReminders': 'Email reminders (Apps Script)',
    'ajustes.data': 'Data & backup', 'ajustes.exportJson': 'Export JSON backup',
    'ajustes.exportCsv': 'Export CSV', 'ajustes.importJson': 'Import JSON backup',
    'ajustes.sync': 'Sync', 'ajustes.lastSync': 'Last sync', 'ajustes.never': 'never',
    'ajustes.forceNow': 'Force now', 'ajustes.conflicts': 'Pending conflicts',
    'ajustes.admin': 'Administration', 'ajustes.adminHint': 'Registered users (admin only)',
    'ajustes.about': 'About', 'ajustes.aboutText': 'Offline-first PWA with Google Sheets as database via Apps Script.',
    'ajustes.clearLocal': 'Clear local data', 'ajustes.dangerZone': 'Danger zone',
    'ajustes.pomodoro': 'Pomodoro (min)', 'ajustes.focus': 'Focus', 'ajustes.rest': 'Rest',

    'import.title': 'Import', 'import.csv': 'Import CSV', 'import.ics': 'Import ICS / iCal',
    'import.pick': 'Choose file', 'import.map': 'Column mapping', 'import.preview': 'Preview',
    'import.duplicates': 'Duplicates detected', 'import.mode': 'Duplicates', 'import.mode.skip': 'Skip',
    'import.mode.import': 'Import anyway', 'import.confirm': 'Import selected', 'import.cancel': 'Cancel import',
    'import.imported': 'tasks imported', 'import.noRows': 'No importable rows found.',
    'import.field': 'Field', 'import.column': 'File column', 'import.ignore': '(ignore)',
    'import.encodingHint': 'CSV may use , ; or tabs as separator (auto-detected).',

    'export.title': 'Export', 'export.ics': 'Download .ics (Google / Outlook / Apple)',
    'export.gcalOne': 'Add to Google Calendar', 'export.outlook': 'Add to Outlook Web',
    'export.pdf': 'Export PDF (printable table)', 'export.csv': 'Export CSV', 'export.json': 'Export JSON',
    'export.range': 'Range', 'export.day1': '1 day', 'export.day2': '2 days', 'export.day3': '3 days',
    'export.week': 'Full week', 'export.month': 'Month', 'export.custom': 'Custom range',
    'export.from': 'From', 'export.to': 'To', 'export.generate': 'Generate', 'export.icsTip': 'An .ics file can be imported into Google Calendar, Outlook and Apple Calendar.',
    'export.printed': 'Generated by Personal Planner',

    'notify.title': 'Notifications', 'notify.granted': 'Notifications enabled', 'notify.denied': 'Permission denied in this browser',
    'notify.trayEmpty': 'No notifications yet', 'notify.markAll': 'Mark as read',
    'notify.reminderBody': 'Task reminder', 'notify.periodicHint': 'With the app installed (Chrome/Edge) reminders are also checked in the background.',

    'contact.call': 'Call', 'contact.whatsapp': 'WhatsApp', 'contact.email': 'Email',

    'sync.conflictTitle': 'Sync conflict', 'sync.conflictBody': 'Server version and yours differ. Which one do you keep?',
    'sync.keepMine': 'Keep mine', 'sync.keepServer': 'Keep server version', 'sync.keepBoth': 'Keep both',
    'sync.resolved': 'Conflict resolved', 'sync.pulled': 'Changes downloaded', 'sync.pushed': 'Changes uploaded',

    'shortcuts.title': 'Keyboard shortcuts',
    'shortcuts.newTask': 'New task', 'shortcuts.search': 'Search', 'shortcuts.go': 'Go to Today / Week / Month / Roles / Long term',
    'shortcuts.today': 'Back to today / this week', 'shortcuts.help': 'Show this help', 'shortcuts.close': 'Close dialog',

    'errors.offlineWrite': 'You are offline: the change was saved and will upload when internet returns.',
    'errors.api': 'Server error', 'errors.network': 'No connection to the server',
    'errors.auth': 'Session expired. Please sign in again.', 'errors.setup': 'Backend not configured yet. Check the README (setupSystem).'
  }
};

let LOCALE = localStorage.getItem('pp_locale') || 'es';

export function t(key) {
  const d = DICT[LOCALE] || DICT.es;
  return d[key] ?? DICT.es[key] ?? key;
}

export function getLocale() {
  return LOCALE;
}

export function setLocale(l, persist = true) {
  LOCALE = l === 'en' ? 'en' : 'es';
  if (persist) localStorage.setItem('pp_locale', LOCALE);
  applyI18n();
  document.documentElement.lang = LOCALE;
  const evt = new CustomEvent('pp:i18n', { detail: { locale: LOCALE } });
  window.dispatchEvent(evt);
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}
