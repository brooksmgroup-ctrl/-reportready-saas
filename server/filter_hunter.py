import urllib.request, json, csv, io, re, os

url = "https://raw.githubusercontent.com/brooksmgroup-ctrl/-reportready-saas/main/hunter_domains_list-txt-2190179-valid%20(1).csv"
resp = urllib.request.urlopen(url)
content = resp.read().decode('utf-8')

reader = csv.DictReader(io.StringIO(content))
headers = reader.fieldnames
print(f"Headers: {headers}")

# Find columns
email_col = next((h for h in headers if 'email' in h.lower()), None)
name_col = next((h for h in headers if 'first' in h.lower() and 'name' in h.lower()), None)
company_col = next((h for h in headers if 'organization' in h.lower() or 'company' in h.lower()), None)
confidence_col = next((h for h in headers if 'confidence' in h.lower()), None)
type_col = next((h for h in headers if h.lower() == 'type'), None)

print(f"Cols: email={email_col}, name={name_col}, company={company_col}, conf={confidence_col}, type={type_col}")

generic = {'info','hello','support','contact','team','help','service','members','shop',
    'customerservice','press','brand','partnerships','collaborations','influencer','concierge',
    'assistant','accessibility','bulkorders','guides','stats','aloha','affiliates','goodday',
    'ohhey','messages','mail','contactus','billing','myteam','do','eamil','australia',
    'dallas','accounts','sales','marketing','enquiries','admin','office','reception',
    'noreply','no-reply','donotreply','privacy','legal','abuse','postmaster','webmaster',
    'hostmaster','jobs','careers','hr','recruitment','newbiz','newbusiness','connect',
    'letstalk','justask','losangeles','newyork','sanclemente','creative','dev','digital',
    'questions','help','hi','hello','hey','career','verticalmove','losangeles','sanclemente','newyork'}

personal = []
generic_count = 0
for row in reader:
    email = row.get(email_col, '').strip()
    if not email or '@' not in email:
        continue
    ctype = row.get(type_col, '').strip().lower() if type_col else ''
    if ctype and ctype != 'personal':
        generic_count += 1
        continue
    prefix = email.split('@')[0].lower()
    if prefix in generic:
        generic_count += 1
        continue
    name = row.get(name_col, '').strip() if name_col else ''
    company = row.get(company_col, '').strip() if company_col else ''
    personal.append({
        'contact_email': email,
        'contact_name': name,
        'name': company or name,
        'confidence': row.get(confidence_col, '').strip() if confidence_col else '',
        'source': 'hunter.io'
    })

print(f"\nPersonal: {len(personal)}, Generic: {generic_count}")

# Save
with open('/home/agent-lead/repo-reportready-saas/server/hunter_contacts.json', 'w') as f:
    json.dump(personal, f, indent=2)
print(f"Saved to server/hunter_contacts.json")

for p in personal[:10]:
    print(f"  {p['contact_email']:40s} {p['contact_name']:20s} [{p['name']}]")