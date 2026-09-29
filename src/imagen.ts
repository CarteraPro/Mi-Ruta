// Reduce la foto (máx. 1280 px, JPEG) para no llenar la memoria del celular.
export async function comprimirFoto(file: File, maxLado = 1280, calidad = 0.75): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad),
  )
}
