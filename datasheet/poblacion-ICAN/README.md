# Población de la base de datos de ICAN

Los ficheros que pueblan Mongo con los 79 servicios de OpenTermsArchive
sincronizados a través de termscockpit — el mismo contenido que
[`../data`](../data), pero en el formato exacto que espera la base de datos de
ICAN, no el de análisis.

Esta carpeta es **lo único de `datasheet/` que se versiona en git**, y es la
fuente de verdad para poblar producción: si la base se pierde o hay que
ampliarla con una tanda nueva, se carga desde aquí. El resto de `datasheet/`
(el análisis en Parquet/CSV y los textos) vive solo en el dataset privado de
Hugging Face.

> No confundir con
> [`api/src/main/database/seeders/mongo/`](../../api/src/main/database/seeders/mongo/):
> ese es el fixture pequeño de dev/test (3 servicios) que carga `seedMongo.ts`
> **borrando la base entera** antes. No tiene nada que ver con esta población y
> no debe llevarla.

## Contenido

| Carpeta | Documentos | Qué es |
|---|---|---|
| `organizations/` | 1 | La organización `terms-cockpit`. |
| `contractCollections/` | 1 | La colección `contrib`. |
| `services/` | 79 | Uno por servicio (Airbnb, Netflix, Google, Kraken, ProtonMail...). |
| `contracts/` | 248 | Uno por documento legal. |
| `contractVersions/` | 1.099 (repartidos en 79 ficheros, uno por servicio) | El texto y el análisis de cada snapshot. |

Cada documento conserva como máximo 5 snapshots: el primero, el último, y hasta
3 intermedios elegidos por mayor cambio.

## Formato

JSON con la notación **EJSON** (Extended JSON) que usa Mongo: los `ObjectId` y
las fechas van envueltos, por ejemplo `{"$oid": "..."}` y
`{"$date": "2020-12-08T15:21:35.000Z"}`, para que no se conviertan en simples
cadenas de texto al guardarlos.

`contractVersions` está partido en un fichero por servicio (`netflix.json`,
`roblox.json`...) porque el conjunto entero pesa 185 MB, por encima del
límite de 100 MB por fichero de GitHub. La librería que hace la carga
(`mongo-seeding`) lee todos los `.json` de una carpeta y los junta como una
sola colección, así que partirlo no cambia nada al usarlo.

## Añadir servicios nuevos

Un solo script se encarga de sincronizar, analizar y añadir. Es **aditivo**: lo
que ya está en la población no se toca, y volver a pasarlo sobre un servicio ya
presente solo reescribe ese servicio.

```bash
cd api
npx tsx scripts/addServicesToPopulation.ts --repos contrib --services Vimeo,Zoom
```

Requiere un termscockpit en marcha y la Mongo local levantada. Al terminar,
revisa el diff de esta carpeta y haz commit.

## Cargarla en producción

```bash
cd api
npx tsx scripts/importOpenTermsPopulation.ts --mongo-uri "mongodb://..." --yes
```

Sin `--yes` hace una pasada en seco y no escribe nada. **Nunca borra**: solo
inserta, así que los usuarios y contratos reales de producción quedan intactos.
Aborta si la organización `terms-cockpit` ya existe en el destino, para no
duplicar una carga anterior.

No uses `seedMongo.ts` contra producción: hace `dropDatabase()` primero.

Verificado el 16 de septiembre de 2026: 79 servicios, 248 contratos,
1.099 versiones y 249.622 cláusulas.
