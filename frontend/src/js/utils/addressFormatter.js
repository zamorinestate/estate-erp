/**
 * Safe Cafe Address and City Formatter
 * Prevents [object Object] from ever rendering in the UI, PDF, modals, or access documents.
 * Handles:
 * - Plain string address
 * - Structured object address ({ building, unit, floor, street, area, locality, city, district, state, pinCode, pincode, postalCode, landmark, line1, line2, addressLine1, addressLine2 })
 * - Missing / null / undefined / corrupted "[object Object]" values
 * - Graceful fallback from cafe.city to cafe.address.city
 */

export function formatCafeAddress(cafeOrAddress) {
  if (!cafeOrAddress) return '';

  // Extract address if passed a cafe object
  let addr = cafeOrAddress;
  if (typeof cafeOrAddress === 'object' && cafeOrAddress !== null && 'address' in cafeOrAddress) {
    addr = cafeOrAddress.address;
  }

  // Handle string address
  if (typeof addr === 'string') {
    const trimmed = addr.trim();
    if (trimmed === '[object Object]' || trimmed === 'null' || trimmed === 'undefined') {
      return '';
    }
    return trimmed;
  }

  // If not object or null
  if (typeof addr !== 'object' || addr === null) {
    return '';
  }

  const parts = [];

  // Line 1: Building / Unit / Floor / AddressLine1 / Line1
  const bldgParts = [addr.building, addr.unit, addr.floor].filter(Boolean).map((s) => String(s).trim());
  const bldgStr = bldgParts.join(', ');
  const line1 = addr.line1 || addr.addressLine1 || bldgStr;
  if (line1 && typeof line1 === 'string' && line1.trim() && line1.trim() !== '[object Object]') {
    parts.push(line1.trim());
  }

  // Line 2: Street / AddressLine2 / Line2
  const line2 = addr.line2 || addr.addressLine2 || addr.street;
  if (line2 && typeof line2 === 'string' && line2.trim() && line2.trim() !== '[object Object]' && !parts.includes(line2.trim())) {
    parts.push(line2.trim());
  }

  // Area / Locality / Landmark
  const locality = addr.locality || addr.area || addr.landmark;
  if (locality && typeof locality === 'string' && locality.trim() && locality.trim() !== '[object Object]' && !parts.includes(locality.trim())) {
    parts.push(locality.trim());
  }

  // City: Check address.city or cafe.city
  const city = addr.city || (typeof cafeOrAddress === 'object' && cafeOrAddress?.city);
  if (city && typeof city === 'string' && city.trim() && city.trim() !== '[object Object]' && !parts.includes(city.trim())) {
    parts.push(city.trim());
  }

  // District
  const district = addr.district;
  if (district && typeof district === 'string' && district.trim() && district.trim() !== '[object Object]' && !parts.includes(district.trim())) {
    parts.push(district.trim());
  }

  // State
  const stateVal = addr.state;
  if (stateVal && typeof stateVal === 'string' && stateVal.trim() && stateVal.trim() !== '[object Object]' && !parts.includes(stateVal.trim())) {
    parts.push(stateVal.trim());
  }

  // PIN code
  const pin = addr.pinCode || addr.pincode || addr.postalCode || addr.zip;
  if (pin && (typeof pin === 'string' || typeof pin === 'number')) {
    const pinStr = String(pin).trim();
    if (pinStr && pinStr !== '[object Object]') {
      if (parts.length > 0 && stateVal && parts[parts.length - 1] === stateVal.trim()) {
        parts[parts.length - 1] = `${stateVal.trim()} ${pinStr}`;
      } else {
        parts.push(pinStr);
      }
    }
  }

  return parts.join(', ');
}

export function getCafeCity(cafe) {
  if (!cafe) return '';
  if (cafe.city && typeof cafe.city === 'string' && cafe.city.trim() && cafe.city.trim() !== '[object Object]') {
    return cafe.city.trim();
  }
  if (
    cafe.address &&
    typeof cafe.address === 'object' &&
    cafe.address.city &&
    typeof cafe.address.city === 'string' &&
    cafe.address.city.trim() !== '[object Object]'
  ) {
    return cafe.address.city.trim();
  }
  if (typeof cafe.address === 'string' && cafe.address.trim()) {
    const trimmed = cafe.address.trim();
    if (trimmed !== '[object Object]') {
      const parts = trimmed.split(',').map((s) => s.trim());
      if (parts.length >= 2) {
        return parts[1] || '';
      }
    }
  }
  return '';
}
