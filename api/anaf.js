const ANAF_API_URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";

function todayInRomania() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim();
}

function buildAddress(record) {
  const generalAddress = normalizeValue(record.date_generale?.adresa);
  if (generalAddress) {
    return generalAddress;
  }

  const fiscalAddress = record.adresa_domiciliu_fiscal || {};
  const socialAddress = record.adresa_sediu_social || {};
  const addressSource =
    Object.keys(fiscalAddress).length > 0 ? fiscalAddress : socialAddress;

  const parts = [
    normalizeValue(addressSource.ddenumire_Strada || addressSource.sdenumire_Strada),
    normalizeValue(addressSource.dnumar_Strada || addressSource.snumar_Strada),
    normalizeValue(addressSource.ddenumire_Localitate || addressSource.sdenumire_Localitate),
    normalizeValue(addressSource.ddenumire_Judet || addressSource.sdenumire_Judet),
    normalizeValue(addressSource.ddetalii_Adresa || addressSource.sdetalii_Adresa),
    normalizeValue(addressSource.dcod_Postal || addressSource.scod_Postal)
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function buildCounty(record) {
  return (
    normalizeValue(record.adresa_domiciliu_fiscal?.ddenumire_Judet) ||
    normalizeValue(record.adresa_sediu_social?.sdenumire_Judet) ||
    null
  );
}

function mapAnafRecord(record, requestedCui) {
  const general = record.date_generale || {};

  return {
    found: true,
    cui: normalizeValue(general.cui) || String(requestedCui),
    companyName: normalizeValue(general.denumire),
    phone: normalizeValue(general.telefon),
    address: buildAddress(record),
    county: buildCounty(record),
    registrationStatus: normalizeValue(general.stare_inregistrare),
    caen: normalizeValue(general.cod_CAEN),
    eFactura: Boolean(general.statusRO_e_Factura),
    queriedAt: normalizeValue(general.data) || todayInRomania()
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "anaf-vercel-function",
      message: "Foloseste POST cu body JSON de forma {\"cui\":\"12345678\"}."
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Metoda nepermisa. Foloseste POST."
    });
  }

  const body = await readJsonBody(req);
  const rawCui = normalizeValue(body?.cui);
  const cui = rawCui ? rawCui.replace(/\D/g, "") : "";

  if (!cui) {
    return res.status(400).json({
      error: "Trimite un CUI valid in campul cui."
    });
  }

  const payload = [
    {
      cui: Number(cui),
      data: todayInRomania()
    }
  ];

  try {
    const anafResponse = await fetch(ANAF_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await anafResponse.text();
    let responseJson = null;

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    if (!responseJson || typeof responseJson !== "object") {
      return res.status(502).json({
        error: "ANAF nu a returnat un raspuns valid.",
        details: responseText.slice(0, 240)
      });
    }

    const foundRecord = Array.isArray(responseJson.found)
      ? responseJson.found[0]
      : null;
    const notFound = Array.isArray(responseJson.notFound)
      ? responseJson.notFound
      : [];

    if (!foundRecord || notFound.includes(Number(cui)) || notFound.includes(cui)) {
      return res.status(200).json({
        found: false,
        cui,
        queriedAt: payload[0].data,
        error: "Compania nu a fost gasita pentru CUI-ul transmis."
      });
    }

    return res.status(200).json(mapAnafRecord(foundRecord, cui));
  } catch (error) {
    return res.status(502).json({
      error: "Interogarea ANAF a esuat.",
      details: error instanceof Error ? error.message : "Eroare necunoscuta."
    });
  }
};
