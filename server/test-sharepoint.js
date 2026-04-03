import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const tokenUrl = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`;
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString()
  });
  const { access_token: token } = await tokenRes.json();
  const headers = { 'Authorization': `Bearer ${token}` };
  const siteId = 'cloudfuzecom.sharepoint.com,23f612c6-8c42-4090-95f1-1123bffb3fad,f4ed6f5c-a93e-4ed4-ad99-3bf65ea2a0dc';

  // 1. Beta pages API (more complete than v1.0)
  console.log('=== Beta Pages API ===');
  const betaRes = await fetch(`https://graph.microsoft.com/beta/sites/${siteId}/pages?$top=50`, { headers });
  console.log('Status:', betaRes.status);
  if (betaRes.ok) {
    const data = await betaRes.json();
    const pages = data.value || [];
    console.log('Pages count:', pages.length);
    for (const p of pages.slice(0, 20)) {
      console.log(`  - "${p.title || p.name}" | ${p.webUrl || ''}`);
    }
  } else {
    console.log('Beta pages failed:', await betaRes.text());
  }

  // 2. Graph Search with region parameter
  console.log('\n=== Graph Search with region=NAM ===');
  const searchRes = await fetch('https://graph.microsoft.com/v1.0/search/query', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        entityTypes: ['listItem', 'driveItem'],
        query: { queryString: 'golden image' },
        from: 0,
        size: 10,
        region: 'NAM'
      }]
    })
  });
  console.log('Search status:', searchRes.status);
  if (searchRes.ok) {
    const data = await searchRes.json();
    const hits = data.value?.[0]?.hitsContainers?.[0]?.hits || [];
    console.log('Hits:', hits.length);
    for (const h of hits.slice(0, 10)) {
      const r = h.resource || {};
      console.log(`  - "${r.name || 'Untitled'}" | ${r.webUrl || ''}`);
      if (h.summary) console.log(`    snippet: ${h.summary.substring(0, 150)}`);
    }
    if (hits.length === 0) {
      console.log('No hits. Full response:', JSON.stringify(data.value?.[0]?.hitsContainers?.[0], null, 2));
    }
  } else {
    console.log('Search failed:', await searchRes.text());
  }

  // 3. Try different regions
  for (const region of ['EUR', 'GBR', 'IND', 'APC']) {
    const res = await fetch('https://graph.microsoft.com/v1.0/search/query', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          entityTypes: ['listItem'],
          query: { queryString: 'golden image' },
          from: 0,
          size: 5,
          region
        }]
      })
    });
    if (res.ok) {
      const d = await res.json();
      const count = d.value?.[0]?.hitsContainers?.[0]?.total || 0;
      if (count > 0) {
        console.log(`\nRegion ${region}: ${count} hits!`);
        const hits = d.value[0].hitsContainers[0].hits || [];
        for (const h of hits.slice(0, 5)) {
          console.log(`  - "${h.resource?.name}" | ${h.resource?.webUrl}`);
        }
      }
    }
  }

  // 4. Try fetching the specific page URL content via SharePoint REST through Graph
  console.log('\n=== Try fetching specific page by name filter ===');
  const filterRes = await fetch(`https://graph.microsoft.com/beta/sites/${siteId}/pages?$filter=contains(name,'Golden')`, { headers });
  console.log('Filter status:', filterRes.status);
  if (filterRes.ok) {
    const data = await filterRes.json();
    console.log('Results:', (data.value || []).length);
    for (const p of (data.value || [])) {
      console.log(`  - "${p.title}" | ${p.name} | ${p.webUrl}`);
    }
  } else {
    console.log(await filterRes.text());
  }

  // 5. Drive items - look in all drives for aspx files
  console.log('\n=== Drive items search ===');
  const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives`, { headers });
  if (drivesRes.ok) {
    const drivesData = await drivesRes.json();
    for (const drive of (drivesData.value || [])) {
      console.log(`\nDrive: ${drive.name} (${drive.id})`);
      const searchDriveRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${drive.id}/root/search(q='golden image')`, { headers });
      if (searchDriveRes.ok) {
        const items = await searchDriveRes.json();
        console.log(`  Results: ${(items.value || []).length}`);
        for (const item of (items.value || []).slice(0, 10)) {
          console.log(`  - "${item.name}" | ${item.webUrl || ''}`);
        }
      }
    }
  }
}

test().catch(e => console.error('Fatal:', e.message));
