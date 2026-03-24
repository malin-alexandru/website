const ANAF_API_URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";

function getTodayPartsInRomania() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

function formatDateParts(year, month, day) {
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function buildQueryDate(yearOverride) {
  const today = getTodayPartsInRomania();
  const selectedYear = Number(yearOverride) || today.year;

  if (selectedYear < today.year) {
    return formatDateParts(selectedYear, 12, 31);
  }

  const lastDayOfMonth = new Date(Date.UTC(selectedYear, today.month, 0)).getUTCDate();
  const safeDay = Math.min(today.day, lastDayOfMonth);

  return formatDateParts(selectedYear, today.month, safeDay);
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

function parseIsoDate(value) {
  const normalized = normalizeValue(value);

  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapAnafRecord(record, requestedCui, requestedDate) {
  const general = record.date_generale || {};
  const vat = record.inregistrare_scop_Tva || {};
  const vatCash = record.inregistrare_RTVAI || {};
  const inactive = record.stare_inactiv || {};
  const splitTva = record.inregistrare_SplitTVA || {};

  return {
    found: true,
    cui: normalizeValue(general.cui) || String(requestedCui),
    companyName: normalizeValue(general.denumire),
    ownerName: null,
    phone: normalizeValue(general.telefon),
    address: buildAddress(record),
    county: buildCounty(record),
    registrationStatus: normalizeValue(general.stare_inregistrare),
    registrationNumber: normalizeValue(general.nrRegCom),
    registrationDate: normalizeValue(general.data_inregistrare),
    caen: normalizeValue(general.cod_CAEN),
    legalForm: normalizeValue(general.forma_juridica),
    organizationForm: normalizeValue(general.forma_organizare),
    ownershipForm: normalizeValue(general.forma_de_proprietate),
    taxOffice: normalizeValue(general.organFiscalCompetent),
    authorizationAct: normalizeValue(general.act),
    iban: normalizeValue(general.iban),
    vatPayer: Boolean(vat.scpTVA),
    vatAtCollection: Boolean(vatCash.statusTvaIncasare),
    inactive: Boolean(inactive.statusInactivi),
    splitTva: Boolean(splitTva.statusSplitTVA),
    eFactura: Boolean(general.statusRO_e_Factura),
    queriedAt: normalizeValue(general.data) || requestedDate
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
  const rawYear = normalizeValue(body?.year);
  const year = rawYear ? rawYear.replace(/\D/g, "") : "";

  if (!cui) {
    return res.status(400).json({
      error: "Trimite un CUI valid in campul cui."
    });
  }

  const currentYear = getTodayPartsInRomania().year;
  const selectedYear = year ? Number(year) : currentYear;

  if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > currentYear) {
    return res.status(400).json({
      error: "Trimite un an valid intre 2000 si anul curent."
    });
  }

  const queryDate = buildQueryDate(selectedYear);

  const payload = [
    {
      cui: Number(cui),
      data: queryDate
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

    const registrationDate = parseIsoDate(foundRecord.date_generale?.data_inregistrare);
    const requestedDate = parseIsoDate(queryDate);

    if (registrationDate && requestedDate && registrationDate > requestedDate) {
      return res.status(200).json({
        found: false,
        cui,
        queriedAt: queryDate,
        error: "Compania nu era inregistrata la data selectata."
      });
    }

    return res.status(200).json(mapAnafRecord(foundRecord, cui, queryDate));
  } catch (error) {
    return res.status(502).json({
      error: "Interogarea ANAF a esuat.",
      details: error instanceof Error ? error.message : "Eroare necunoscuta."
    });
  }
};
