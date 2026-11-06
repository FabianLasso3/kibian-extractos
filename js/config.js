/* Configuracion de Kibian Extractos.
   Cambia estos valores antes de publicar. */
window.KIBIAN_CONFIG = {
  version: '0.6.0',

  // Plan gratis: conversiones ilimitadas, un extracto a la vez,
  // y el archivo trae hasta este numero de movimientos por extracto.
  freeRowsPerStatement: 25,

  // Precios que se muestran en la web (deben coincidir con Lemon Squeezy)
  pricePass: '$4.99',       // Pase: 30 dias de acceso, no se renueva
  priceYearly: '$39.99',    // Pro anual, suscripcion
  priceYearlyPerMonth: '$3.33',

  // Links de pago de Lemon Squeezy (Store > Products > Share > Checkout URL)
  checkoutPass: 'https://kibianpixel.lemonsqueezy.com/checkout/buy/e1b5b7fb-be25-4ab5-b495-d32cc9fd24e2',
  checkoutYearly: 'https://kibianpixel.lemonsqueezy.com/checkout/buy/f7586e57-9a91-4487-83f7-af1c12222152',

  // Responsable del servicio (aparece en Terminos y Politica de privacidad)
  ownerName: 'Fabian Steven Lasso Ramírez',
  ownerLocation: 'Pasto, Nariño, Colombia',
  legalUpdated: '6 de noviembre de 2026',
  refundDays: 7,

  // Correo de contacto para soporte y solicitudes de bancos
  contactEmail: 'fabianstivenlasso@gmail.com',

  // IDs de los productos en Lemon Squeezy (Pase y Pro anual). Recomendado:
  // evita que alguien use una licencia de otro producto de tu tienda.
  lsProductIds: [1496111],

  // Puente opcional para licencias (Cloudflare Worker). Dejalo vacio si la activacion
  // funciona directo. Si falla, crea el Worker de la carpeta cloudflare-worker y pega aqui su URL.
  licenseProxy: '',

  // Dias que el plan pagado sigue activo sin conexion desde la ultima validacion
  licenseOfflineGraceDays: 7
};
