// ═══════════════════════════════════════════════════════════════════════
//  paisajes.js
//  Datos de cada Paisaje Productivo Protegido (PPP)
//
//  ✅ Coordenadas actualizadas desde archivo oficial:
//     "Coordenadas_toma_de_pronostico.xlsx"
//
//  Campos:
//    n   → nombre del paisaje
//    e   → estado operacional: 'favorable' | 'restriccion' | 'sin-rdcft'
//    lat → latitud  (decimal)
//    lon → longitud (decimal)
//    sem → semáforo semanal (7 valores): 'ok' | 'warn' | 'bad' | 'neutral'
//    c   → comentario operacional
//    p   → nota de precipitaciones (null si no aplica)
// ═══════════════════════════════════════════════════════════════════════

const PAISAJES = [
  {
    n:   'Cordillera del Maule',
    e:   'restriccion',
    lat: -34.979398726385774,
    lon: -71.23783091701168,
    sem: ['bad','ok','ok','ok','ok','ok','neutral'],
    c:   'Desde martes 21 mejora la ventana operativa con temperaturas y vientos moderados a bajos.',
    p:   'Muy baja acumulación últimos 7 días'
  },
  {
    n:   'Lomas de Quivolgo',
    e:   'favorable',
    lat: -35.33428892068712,
    lon: -72.41147351436757,
    sem: ['ok','ok','warn','warn','warn','warn','neutral'],
    c:   'Ventana óptima lunes-martes. Desde miércoles vientos >10 km/h impiden intervención.',
    p:   'Sin precipitaciones últimos 7 días'
  },
  {
    n:   'Ruiles de la Costa Maulina',
    e:   'restriccion',
    lat: -35.43196774893392,
    lon: -71.6515718397256,
    sem: ['ok','ok','bad','bad','bad','bad','neutral'],
    c:   'Ventana operativa lunes-martes. Desde miércoles vientos >10 km/h impiden intervención segura.',
    p:   'Muy baja acumulación últimos 7 días'
  },
  {
    n:   'Secanos del Mataquito',
    e:   'sin-rdcft',
    lat: -35.0943943253781,
    lon: -72.02029054670652,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Valle de Cauquenes',
    e:   'sin-rdcft',
    lat: -35.96459716758494,
    lon: -72.31704090506574,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Arenales de Cholguán',
    e:   'restriccion',
    lat: -37.16589686645013,
    lon: -72.07072314822948,
    sem: ['ok','ok','bad','bad','bad','neutral','neutral'],
    c:   'Ventana óptima lunes-martes. Desde miércoles aumenta velocidad del viento.',
    p:   'Sin precipitaciones últimos 7 días'
  },
  {
    n:   'Canteras del Laja',
    e:   'favorable',
    lat: -37.541933248800596,
    lon: -72.00792589970426,
    sem: ['neutral','ok','ok','ok','ok','ok','neutral'],
    c:   'Desde martes 21 hasta sábado 25 condiciones ideales con vientos bajos.',
    p:   'Sin precipitaciones últimos 7 días'
  },
  {
    n:   'Cordillera de Huemules',
    e:   'sin-rdcft',
    lat: -36.62725602924487,
    lon: -71.76671294382363,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Costa de Queules',
    e:   'sin-rdcft',
    lat: -36.483060785070855,
    lon: -72.70800441339308,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Robles de Coyanmahuida',
    e:   'restriccion',
    lat: -36.8223905011113,
    lon: -72.67322487299809,
    sem: ['ok','ok','bad','bad','bad','neutral','neutral'],
    c:   'Condiciones adecuadas lunes y martes. Desde miércoles aumenta viento.',
    p:   'Precipitaciones >12 mm últimos 7 días'
  },
  {
    n:   'Secanos del Ñuble',
    e:   'restriccion',
    lat: -36.70734811075861,
    lon: -72.10889878207277,
    sem: ['ok','ok','bad','bad','bad','neutral','neutral'],
    c:   'Ventana óptima lunes y martes. Desde miércoles vientos >13 km/h impiden intervención.',
    p:   'Sin precipitaciones últimos 7 días'
  },
  {
    n:   'Valle del Itata',
    e:   'sin-rdcft',
    lat: -36.663262782918125,
    lon: -72.47127915457551,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Biobio Sur',
    e:   'favorable',
    lat: -37.16290452979899,
    lon: -73.10067667867484,
    sem: ['ok','ok','ok','ok','ok','ok','neutral'],
    c:   'Ventana operacional lunes 20 al sábado 25 con vientos de baja intensidad.',
    p:   null
  },
  {
    n:   'Cuenca de Curanilahue',
    e:   'favorable',
    lat: -37.475184943409886,
    lon: -73.35198690968099,
    sem: ['ok','ok','ok','ok','ok','ok','neutral'],
    c:   'Ventana operacional lunes 20 al sábado 25 con vientos de baja intensidad.',
    p:   'Precipitaciones significativas >52 mm últimos 7 días'
  },
  {
    n:   'Costa Leufú',
    e:   'sin-rdcft',
    lat: -37.62372962454263,
    lon: -73.45856937218178,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Golfo de Arauco',
    e:   'sin-rdcft',
    lat: -37.24600844905473,
    lon: -73.3239388932334,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Cumbres de Nahuelbuta',
    e:   'sin-rdcft',
    lat: -37.799924257788916,
    lon: -73.39289238327038,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Malleco',
    e:   'restriccion',
    lat: -38.24983337293179,
    lon: -72.67033365090721,
    sem: ['ok','ok','ok','ok','warn','neutral','neutral'],
    c:   'Lunes a jueves condiciones adecuadas. Viernes con pronóstico de precipitaciones.',
    p:   'Precipitaciones significativas >29 mm últimos 7 días'
  },
  {
    n:   'Bosque Valdiviano',
    e:   'restriccion',
    lat: -39.82639693632048,
    lon: -73.2198358815028,
    sem: ['ok','ok','bad','bad','bad','bad','neutral'],
    c:   'Lunes y martes condiciones adecuadas. Desde miércoles precipitaciones impiden quemas.',
    p:   'Precipitaciones significativas >69 mm últimos 7 días'
  },
  {
    n:   'Valle del Rucapillán',
    e:   'sin-rdcft',
    lat: -39.362240779712586,
    lon: -72.63781580748447,
    sem: ['neutral','neutral','neutral','neutral','neutral','neutral','neutral'],
    c:   'Sin operaciones programadas de fuego técnico durante la semana.',
    p:   null
  },
  {
    n:   'Río Cruces',
    e:   'restriccion',
    lat: -40.08345185296913,
    lon: -72.86992969259563,
    sem: ['ok','ok','bad','ok','bad','bad','neutral'],
    c:   'Condiciones adecuadas lunes, martes y jueves. Resto de la semana con precipitaciones.',
    p:   null
  },
  {
    n:   'Río Bueno',
    e:   'restriccion',
    lat: -40.31542680714991,
    lon: -73.01774350804716,
    sem: ['ok','ok','bad','ok','bad','neutral','neutral'],
    c:   'Condiciones adecuadas lunes, martes y jueves. Resto de la semana con precipitaciones.',
    p:   'Precipitaciones >21 mm últimos 7 días'
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  ZONAS — agrupación de paisajes por zona geográfica
//  Usado por el sidebar para mostrar grupos desplegables
// ═══════════════════════════════════════════════════════════════════════

const ZONAS = [
  {
    nombre: 'Zona Constitución',
    paisajes: [
      'Cordillera del Maule',
      'Lomas de Quivolgo',
      'Ruiles de la Costa Maulina',
      'Secanos del Mataquito',
      'Valle de Cauquenes',
      'Arenales de Cholguán',
    ]
  },
  {
    nombre: 'Zona Chillán',
    paisajes: [
      'Canteras del Laja',
      'Cordillera de Huemules',
      'Costa de Queules',
      'Robles de Coyanmahuida',
      'Secanos del Ñuble',
      'Valle del Itata',
    ]
  },
  {
    nombre: 'Zona Arauco',
    paisajes: [
      'Biobio Sur',
      'Cuenca de Curanilahue',
      'Costa Leufú',
      'Golfo de Arauco',
      'Cumbres de Nahuelbuta',
      'Malleco',
    ]
  },
  {
    nombre: 'Zona Valdivia',
    paisajes: [
      'Bosque Valdiviano',
      'Valle del Rucapillán',
      'Río Cruces',
      'Río Bueno',
    ]
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  MAPEO PAISAJE → ESTACIONES PROPIAS (según informe PPT)
//  Estas son las estaciones que se muestran resaltadas en cada lámina
//  del informe meteorológico semanal.
// ═══════════════════════════════════════════════════════════════════════

const ESTACIONES_PAISAJE = {
  // ── Zona Constitución ───────────────────────────────────────────────
  'Cordillera del Maule':      ['Talca', 'El Auquil'],
  'Lomas de Quivolgo':         ['Carrizal', 'Vivero Quivolgo'],
  'Ruiles de la Costa Maulina':['Cuyuname', 'Santa Estela'],
  'Secanos del Mataquito':     ['Hualañé', 'Palhuen', 'Curepto'],
  'Valle de Cauquenes':        ['Cauquenes'],

  // ── Zona Chillán ────────────────────────────────────────────────────
  'Arenales de Cholguán':      ['Siberia', 'Yungay'],
  'Canteras del Laja':         ['Human'],
  'Cordillera de Huemules':    ['El Kayser'],
  'Costa de Queules':          ['Totoral', 'Zorzal Blanco', 'Puralihue'],
  'Robles de Coyanmahuida':    ['Cangrejillo', 'Concepción'],
  'Secanos del Ñuble':         ['El Espolón', 'Quilamapu'],
  'Valle del Itata':           ['Nueva Aldea', 'Portezuelo', 'Zorzal Blanco', 'Coyanco'],

  // ── Zona Arauco ─────────────────────────────────────────────────────
  'Biobio Sur':                ['Tanahullin', 'Santa Juana'],
  'Cuenca de Curanilahue':     ['La Colcha'],
  'Costa Leufú':               ['Lebu'],
  'Golfo de Arauco':           ['Las Puentes'],
  'Cumbres de Nahuelbuta':     ['Llanquehue'],
  'Malleco':                   ['Baltimore', 'Santa Amelia'],

  // ── Zona Valdivia ───────────────────────────────────────────────────
  'Bosque Valdiviano':         ['Pancul', 'Llongo'],
  'Valle del Rucapillán':      ['La Paz', 'Aeródromo Maquehue'],
  'Río Cruces':                [],
  'Río Bueno':                 ['Oldenburgo', 'Liceo Agrotec', 'El Copihue'],
};