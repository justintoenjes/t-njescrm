import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

const FRITZBOX_URL = 'http://192.168.178.1:49000';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { number } = body as { number: string };

  if (!number) return NextResponse.json({ error: 'Nummer erforderlich' }, { status: 400 });

  // TR-064 dial via Fritz!Box — uses the X_AVM-DE_OnTel service
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:X_AVM-DE_Dial xmlns:u="urn:dslforum-org:service:X_VoIP:1">
      <NewX_AVM-DE_PhoneNumber>${number}</NewX_AVM-DE_PhoneNumber>
    </u:X_AVM-DE_Dial>
  </s:Body>
</s:Envelope>`;

  try {
    const res = await fetch(`${FRITZBOX_URL}/upnp/control/x_voip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': '"urn:dslforum-org:service:X_VoIP:1#X_AVM-DE_Dial"',
      },
      body: soapBody,
    });

    if (res.ok) {
      return NextResponse.json({ ok: true, message: 'Wähle...' });
    }

    // If TR-064 needs auth, try with the simpler wählhilfe URL
    const dialUrl = `http://192.168.178.1/fon_num/foncalls_list.lua?dial=${encodeURIComponent(number)}&dialport=611`;
    const res2 = await fetch(dialUrl);
    if (res2.ok) {
      return NextResponse.json({ ok: true, message: 'Wähle...' });
    }

    return NextResponse.json({ error: 'Fritz!Box Wählhilfe fehlgeschlagen' }, { status: 502 });
  } catch {
    return NextResponse.json({ error: 'Fritz!Box nicht erreichbar' }, { status: 502 });
  }
}
