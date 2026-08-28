"""curated catalogue of well-known airlines, keyed by ICAO designator"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class Airline:
    """one operator, identified by its ICAO designator"""

    icao: str
    iata: str | None
    name: str
    country: str
    callsign: str | None = None


def _a(
    icao: str, iata: str | None, name: str, country: str, callsign: str | None = None
) -> Airline:
    return Airline(icao=icao, iata=iata, name=name, country=country, callsign=callsign)


AIRLINES: Final[tuple[Airline, ...]] = (
    # europe: full service
    _a("BAW", "BA", "British Airways", "United Kingdom", "Speedbird"),
    # _a("SHT", "BA", "British Airways Shuttle", "United Kingdom", "Shuttle"),
    # _a("CFE", "BA", "BA CityFlyer", "United Kingdom", "Flyer"),
    _a("DLH", "LH", "Lufthansa", "Germany", "Lufthansa"),
    _a("GEC", "LH", "Lufthansa Cargo", "Germany", "Lufthansa Cargo"),
    _a("CLH", "CL", "Lufthansa CityLine", "Germany", "Hansaline"),
    _a("EWG", "EW", "Eurowings", "Germany", "Eurowings"),
    _a("AFR", "AF", "Air France", "France", "Airfrans"),
    _a("KLM", "KL", "KLM Royal Dutch Airlines", "Netherlands", "KLM"),
    _a("KLC", "WA", "KLM Cityhopper", "Netherlands", "City"),
    _a("IBE", "IB", "Iberia", "Spain", "Iberia"),
    _a("IBS", "I2", "Iberia Express", "Spain", "Iberexpres"),
    _a("SWR", "LX", "SWISS", "Switzerland", "Swiss"),
    _a("AUA", "OS", "Austrian Airlines", "Austria", "Austrian"),
    _a("BEL", "SN", "Brussels Airlines", "Belgium", "Bee-Line"),
    _a("SAS", "SK", "SAS Scandinavian Airlines", "Sweden", "Scandinavian"),
    _a("FIN", "AY", "Finnair", "Finland", "Finnair"),
    _a("ICE", "FI", "Icelandair", "Iceland", "Iceair"),
    _a("TAP", "TP", "TAP Air Portugal", "Portugal", "Air Portugal"),
    _a("ITY", "AZ", "ITA Airways", "Italy", "Itarrow"),
    _a("AEE", "A3", "Aegean Airlines", "Greece", "Aegean"),
    _a("LOT", "LO", "LOT Polish Airlines", "Poland", "Lot"),
    _a("CSA", "OK", "Czech Airlines", "Czechia", "CSA-Lines"),
    _a("ROT", "RO", "TAROM", "Romania", "Tarom"),
    _a("BTI", "BT", "airBaltic", "Latvia", "Airbaltic"),
    _a("AFL", "SU", "Aeroflot", "Russia", "Aeroflot"),
    _a("THY", "TK", "Turkish Airlines", "Turkey", "Turkish"),
    _a("EIN", "EI", "Aer Lingus", "Ireland", "Shamrock"),
    _a("VIR", "VS", "Virgin Atlantic", "United Kingdom", "Virgin"),
    _a("CFG", "DE", "Condor", "Germany", "Condor"),
    _a("TRA", "HV", "Transavia", "Netherlands", "Transavia"),
    _a("TVF", "TO", "Transavia France", "France", "France Soleil"),
    _a("AEA", "UX", "Air Europa", "Spain", "Europa"),
    _a("DLA", "EN", "Air Dolomiti", "Italy", "Dolomiti"),
    _a("CTN", "OU", "Croatia Airlines", "Croatia", "Croatia"),
    _a("LGL", "LG", "Luxair", "Luxembourg", "Luxair"),
    _a("LOG", "LM", "Loganair", "United Kingdom", "Logan"),
    _a("TUI", "X3", "TUIfly", "Germany", "Tuijet"),
    # europe: low cost
    _a("RYR", "FR", "Ryanair", "Ireland", "Ryanair"),
    _a("RUK", "RK", "Ryanair UK", "United Kingdom", "Bluemax"),
    _a("EZY", "U2", "easyJet", "United Kingdom", "Easy"),
    _a("EJU", "U2", "easyJet Europe", "Austria", "Alpine"),
    _a("WZZ", "W6", "Wizz Air", "Hungary", "Wizz Air"),
    _a("VLG", "VY", "Vueling", "Spain", "Vueling"),
    _a("NAX", "DY", "Norwegian Air Shuttle", "Norway", "Nor Shuttle"),
    _a("NOZ", "D8", "Norwegian Air Sweden", "Sweden", "Nordic"),
    _a("EXS", "LS", "Jet2", "United Kingdom", "Channex"),
    _a("TOM", "BY", "TUI Airways", "United Kingdom", "Tomjet"),
    _a("PGT", "PC", "Pegasus Airlines", "Turkey", "Sunturk"),
    _a("SXS", "XQ", "SunExpress", "Turkey", "Sunexpress"),
    # middle East
    _a("UAE", "EK", "Emirates", "United Arab Emirates", "Emirates"),
    _a("ETD", "EY", "Etihad Airways", "United Arab Emirates", "Etihad"),
    _a("QTR", "QR", "Qatar Airways", "Qatar", "Qatari"),
    _a("SVA", "SV", "Saudia", "Saudi Arabia", "Saudia"),
    _a("KAC", "KU", "Kuwait Airways", "Kuwait", "Kuwaiti"),
    _a("OMA", "WY", "Oman Air", "Oman", "Oman Air"),
    _a("GFA", "GF", "Gulf Air", "Bahrain", "Gulf Air"),
    _a("RJA", "RJ", "Royal Jordanian", "Jordan", "Jordanian"),
    _a("MEA", "ME", "Middle East Airlines", "Lebanon", "Cedar Jet"),
    _a("ELY", "LY", "El Al", "Israel", "El Al"),
    _a("FDB", "FZ", "flydubai", "United Arab Emirates", "Skydubai"),
    _a("ABY", "G9", "Air Arabia", "United Arab Emirates", "Arabia"),
    # south and Central Asia
    _a("AIC", "AI", "Air India", "India", "Airindia"),
    _a("AXB", "IX", "Air India Express", "India", "Express India"),
    _a("IGO", "6E", "IndiGo", "India", "IFLY"),
    _a("SEJ", "SG", "SpiceJet", "India", "Spicejet"),
    _a("AKJ", "QP", "Akasa Air", "India", "Akasa Air"),
    # _a("PIA", "PK", "Pakistan International Airlines", "Pakistan", "Pakistan"),
    # _a("BBC", "BG", "Biman Bangladesh Airlines", "Bangladesh", "Bangladesh"),
    # _a("ALK", "UL", "SriLankan Airlines", "Sri Lanka", "Srilankan"),
    # _a("KZR", "KC", "Air Astana", "Kazakhstan", "Astanaline"),
    # east and Southeast Asia
    _a("SIA", "SQ", "Singapore Airlines", "Singapore", "Singapore"),
    # _a("TGW", "TR", "Scoot", "Singapore", "Scooter"),
    _a("CPA", "CX", "Cathay Pacific", "Hong Kong", "Cathay"),
    _a("HKE", "UO", "HK Express", "Hong Kong", "Hongkong Shuttle"),
    _a("AHK", "LD", "AHK Air Hong Kong", "Hong Kong", "Air Hong Kong"),
    _a("CCA", "CA", "Air China", "China", "Air China"),
    _a("CES", "MU", "China Eastern Airlines", "China", "China Eastern"),
    _a("CSN", "CZ", "China Southern Airlines", "China", "China Southern"),
    _a("CHH", "HU", "Hainan Airlines", "China", "Hainan"),
    _a("CQH", "9C", "Spring Airlines", "China", "Air Spring"),
    _a("CAL", "CI", "China Airlines", "Taiwan", "Dynasty"),
    _a("EVA", "BR", "EVA Air", "Taiwan", "Eva"),
    _a("JAL", "JL", "Japan Airlines", "Japan", "Japan Air"),
    _a("ANA", "NH", "All Nippon Airways", "Japan", "All Nippon"),
    _a("NCA", "KZ", "Nippon Cargo Airlines", "Japan", "Nippon Cargo"),
    _a("KAL", "KE", "Korean Air", "South Korea", "Koreanair"),
    _a("AAR", "OZ", "Asiana Airlines", "South Korea", "Asiana"),
    _a("JNA", "LJ", "Jin Air", "South Korea", "Jin Air"),
    _a("TWB", "TW", "T'way Air", "South Korea", "Teeway"),
    _a("THA", "TG", "Thai Airways International", "Thailand", "Thai"),
    _a("MAS", "MH", "Malaysia Airlines", "Malaysia", "Malaysian"),
    _a("AXM", "AK", "AirAsia", "Malaysia", "Red Cap"),
    _a("GIA", "GA", "Garuda Indonesia", "Indonesia", "Indonesia"),
    _a("PAL", "PR", "Philippine Airlines", "Philippines", "Philippine"),
    _a("CEB", "5J", "Cebu Pacific", "Philippines", "Cebu Air"),
    _a("HVN", "VN", "Vietnam Airlines", "Vietnam", "Viet Nam Airlines"),
    _a("BRU", "BI", "Royal Brunei Airlines", "Brunei", "Brunei"),
    _a("CRK", "HX", "Hong Kong Airlines", "Hong Kong", "Bauhinia"),
    _a("CSZ", "ZH", "Shenzhen Airlines", "China", "Shenzhen Air"),
    _a("DKH", "HO", "Juneyao Air", "China", "Air Juneyao"),
    _a("CDG", "SC", "Shandong Airlines", "China", "Shandong"),
    _a("GCR", "GS", "Tianjin Airlines", "China", "Bo Hai"),
    _a("VJC", "VJ", "VietJet Air", "Vietnam", "Vietjetair"),
    # oceania
    _a("QFA", "QF", "Qantas", "Australia", "Qantas"),
    _a("JST", "JQ", "Jetstar", "Australia", "Jetstar"),
    _a("VOZ", "VA", "Virgin Australia", "Australia", "Velocity"),
    _a("ANZ", "NZ", "Air New Zealand", "New Zealand", "New Zealand"),
    # north America
    _a("AAL", "AA", "American Airlines", "United States", "American"),
    _a("UAL", "UA", "United Airlines", "United States", "United"),
    _a("DAL", "DL", "Delta Air Lines", "United States", "Delta"),
    _a("SWA", "WN", "Southwest Airlines", "United States", "Southwest"),
    _a("JBU", "B6", "JetBlue Airways", "United States", "JetBlue"),
    _a("ASA", "AS", "Alaska Airlines", "United States", "Alaska"),
    _a("NKS", "NK", "Spirit Airlines", "United States", "Spirit Wings"),
    _a("FFT", "F9", "Frontier Airlines", "United States", "Frontier Flight"),
    _a("HAL", "HA", "Hawaiian Airlines", "United States", "Hawaiian"),
    _a("ACA", "AC", "Air Canada", "Canada", "Air Canada"),
    _a("ROU", "RV", "Air Canada Rouge", "Canada", "Rouge"),
    _a("WJA", "WS", "WestJet", "Canada", "Westjet"),
    _a("AMX", "AM", "Aeroméxico", "Mexico", "Aeromexico"),
    _a("VOI", "Y4", "Volaris", "Mexico", "Volaris"),
    # latin America
    _a("LAN", "LA", "LATAM Airlines", "Chile", "LAN"),
    _a("TAM", "JJ", "LATAM Brasil", "Brazil", "TAM"),
    _a("GLO", "G3", "GOL Linhas Aéreas", "Brazil", "Gol Transporte"),
    _a("AZU", "AD", "Azul Brazilian Airlines", "Brazil", "Azul"),
    _a("ARG", "AR", "Aerolíneas Argentinas", "Argentina", "Argentina"),
    _a("AVA", "AV", "Avianca", "Colombia", "Avianca"),
    _a("CMP", "CM", "Copa Airlines", "Panama", "Copa"),
    # africa
    _a("ETH", "ET", "Ethiopian Airlines", "Ethiopia", "Ethiopian"),
    _a("MSR", "MS", "EgyptAir", "Egypt", "Egyptair"),
    # _a("RAM", "AT", "Royal Air Maroc", "Morocco", "Royalair Maroc"),
    # _a("KQA", "KQ", "Kenya Airways", "Kenya", "Kenya"),
    # _a("SAA", "SA", "South African Airways", "South Africa", "Springbok"),
    # cargo and business aviation
    _a("FDX", "FX", "FedEx Express", "United States", "FedEx"),
    _a("UPS", "5X", "UPS Airlines", "United States", "UPS"),
    _a("DHK", "D0", "DHL Air UK", "United Kingdom", "World Express"),
    _a("BCS", "QY", "DHL / European Air Transport", "Belgium", "Eurotrans"),
    _a("CLX", "CV", "Cargolux", "Luxembourg", "Cargolux"),
    _a("GTI", "5Y", "Atlas Air", "United States", "Giant"),
    _a("BOX", "3S", "AeroLogic", "Germany", "German Cargo"),
    _a("NJE", None, "NetJets Europe", "Portugal", "Fraction"),
    _a("EJA", None, "NetJets", "United States", "Execjet"),
    _a("LXJ", None, "Flexjet", "United States", "Flexjet"),
    _a("CKS", "K4", "Kalitta Air", "United States", "Connie"),
    _a("AZG", "7L", "Silk Way West Airlines", "Azerbaijan", "Silk West"),
)

AIRLINES_BY_ICAO: Final[dict[str, Airline]] = {airline.icao: airline for airline in AIRLINES}


@dataclass(frozen=True, slots=True)
class FlightIdentity:
    """what a callsign resolves to: who is operating, and which flight"""

    airline: Airline
    atc_number: str
    flight_number: str | None

    @property
    def display_name(self) -> str:
        return self.flight_number or f"{self.airline.icao}{self.atc_number}"


def identify_flight(callsign: str | None) -> FlightIdentity | None:
    """
    resolve operator and flight number from an ADS-B callsign

    returns ``None`` for private and general-aviation callsigns, which are usually the aircraft's own registration
    see the module docstring for the digit rule that separates the two
    """
    if not callsign:
        return None

    trimmed = callsign.strip().upper()
    if len(trimmed) < 4:
        return None

    prefix, remainder = trimmed[:3], trimmed[3:]
    if not prefix.isalpha():
        return None
    # a flight number distinguishes an airline callsign from a registration
    if not any(character.isdigit() for character in remainder):
        return None

    airline = AIRLINES_BY_ICAO.get(prefix)
    if airline is None:
        return None

    # airlines pad the ATC number with zeros more often than the timetable does
    atc_number = remainder.lstrip("0") or remainder
    return FlightIdentity(
        airline=airline,
        atc_number=atc_number,
        flight_number=f"{airline.iata}{atc_number}" if airline.iata else None,
    )


def lookup_airline(callsign: str | None) -> Airline | None:
    """just the operator, for callers that do not need the flight number"""
    identity = identify_flight(callsign)
    return identity.airline if identity else None


__all__ = [
    "AIRLINES",
    "AIRLINES_BY_ICAO",
    "Airline",
    "FlightIdentity",
    "identify_flight",
    "lookup_airline",
]
