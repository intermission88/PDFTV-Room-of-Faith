-- 1. Buat Tabel "PDFTV Feeds" di Supabase
CREATE TABLE IF NOT EXISTS public."PDFTV Feeds" (
    id BIGINT PRIMARY KEY,
    alias TEXT NOT NULL,
    confession TEXT NOT NULL,
    upvotes INT DEFAULT 0,
    comments JSONB DEFAULT '[]'::jsonb,
    timestamp BIGINT,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aktifkan Row Level Security (RLS) dan berikan izin Akses Publik
ALTER TABLE public."PDFTV Feeds" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Access" ON public."PDFTV Feeds";
DROP POLICY IF EXISTS "Public Insert Access" ON public."PDFTV Feeds";
DROP POLICY IF EXISTS "Public Update Access" ON public."PDFTV Feeds";

CREATE POLICY "Public Read Access" ON public."PDFTV Feeds" FOR SELECT USING (true);
CREATE POLICY "Public Insert Access" ON public."PDFTV Feeds" FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public."PDFTV Feeds" FOR UPDATE USING (true);

-- 3. Masukkan / Seed seluruh 35 Data Pengakuan CSV ke Supabase
INSERT INTO public."PDFTV Feeds" (id, alias, confession, upvotes, comments, timestamp, is_pinned)
VALUES
(1785204330064, 'Ceweknya yamal', 'Pertamax', 2, '["aku yang kedua -mr z", "Ayoo ngentott"]'::jsonb, 1785204330065, false),
(1785204851450, 'jancuk', 'Jilat anus gw dong', 0, '["rujit goblog sia -mr z", "tolol"]'::jsonb, 1785204851450, false),
(1785206445292, 'Dreamybull', 'Yes, thank you so much, i am about to cum, yes its time, its time, i am about to bluooowwww', 0, '["yess yess yessss, amba tuuu buuuusstttttt -mr z"]'::jsonb, 1785206445292, false),
(1785206508909, 'Farhan', 'Alah miskin sulit susah ripuh busung lapar sifilis homeless hiv aids rumah kardus', 0, '[]'::jsonb, 1785206508909, false),
(1785207481214, 'Si amet', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus vestibulum tincidunt erat, id euismod orci ullamcorper lacinia. Sed vitae dapibus metus. Morbi tincidunt sem at ornare viverra. Aenean nisl massa, eleifend sed pharetra et, tempus sit amet justo. Aliquam malesuada lacus felis, non dictum nisl gravida tincidunt. Nam lacinia dignissim erat et convallis. Quisque sit amet fermentum metus.', 0, '[]'::jsonb, 1785207481214, false),
(1785207659592, 'el mama', 'mengenang perpisahan the FYI dude', 0, '["H+ berapa min? -jamie", "group sudah tenang"]'::jsonb, 1785207659592, false),
(1785207709547, 'batak', 'pengin di kocokin :(((((', 0, '["ini pasti akbar -mr z"]'::jsonb, 1785207709547, false),
(1785208478037, 'El maca', 'I want my odyssey', 0, '["wtf el maca, lmao", "sudah di pastikan ini el maca palsu yah -el loco", "el maca menurut gw stop unjuk kepunyaan yah cik"]'::jsonb, 1785208478038, false),
(1785209442056, 'pak cikini', 'akbar bau bensin warteg. yang setuju upvote', 11, '["Weladalah, pak cikini ke gondangdia loh ya", "sudah di upvote kan, dan mari kita viralkan -el loco", "ni siapa anjinf -akbrv"]'::jsonb, 1785209442056, true),
(1785209830993, 'Mas Rusdi', 'Jangan sasimok yah mut', 0, '["MAS RUSDI aku penggemarmu, agendakan kita ngobar -el loco", "mas rusdi sudah datang loh ya", "Ditunggu kunjungan wisata ke ngawi ya mas -jamie"]'::jsonb, 1785209830993, false),
(1785211877660, 'Ijal', 'Gw sange', 1, '[]'::jsonb, 1785211877660, false),
(1785212193986, 'Baxtreet', 'aku suka anak TK', 1, '["FBI OPEN UP!!!!!! -leon", "hey hey siapa ini wakk", "Sianjirrrr"]'::jsonb, 1785212193986, false),
(1785213265194, 'Jawir pengocoxx', 'Jadi ges lu kenal orang random, at some moment lu ada ketertarikan trus ngewe lah ya long story short. Waktu kejadian jaman kuliah, tpi habis itu lost kontak karna ya udah bosen kali ya. 3 tahun selanjutnya, ada sepupu jauh gue tuh nikahan, ada undangan tuh di grup kluarga besar. Sebagai perwakilan keluarga kan gue dateng ya. Eh taunya si mempelai cwek loh kok kenal, lah trnyata sianjir yg dulu ngewe ma gua. Dah gtu aja sih. Toh gue juga gak akrab ama sepupu ini wkwkwk. Sepupu gue sih sempet ngasih tahu, kata istrinya kaget kalo gue masih sekeluarga ma sepupu gue. Gue sih bilangnya, kenal dari online wkwk', 0, '["parah lo, tukang ngews", "emang dasar pengentot handal", "bukan pengentot handal, manipulative mastery. gimana caranya coba lu bayangkan", "males bayangin", "males banget bacanya, cabut cabut lu ah", "awoekwaeawe ngntod ngntodan, gw ewe juga lu el maca", "hytamkan lalu penjarakan"]'::jsonb, 1785213265196, false),
(1785214318460, 'x', 'eh caca living together yuk', 0, '["gue bilangin laki nye", "Eh asw siapa lu"]'::jsonb, 1785214318460, false),
(1785214962084, 'Hi Siri', 'Matahari terbit di?', 0, '["disini bukan tempat AI satttttttttt", "digidaw", "pepek menujut ke silit"]'::jsonb, 1785214962084, false),
(1785218554978, 'perut kosong', 'mata segede kontol ngaku chindo', 1, '["siapa tuh cik kira-kira", "akbar lah siapa lagiii", "Fitur sipit ilang dari anda", "wkwkwk itu fix goblok"]'::jsonb, 1785218554978, false),
(1785223032041, 'Mamank Garox', 'Terima kasih buat lo semua ngentot, gua masih stay disini', 0, '["Ma sama"]'::jsonb, 1785223032041, false),
(1785237408544, 'aodion', 'Mama aing criminal !!', 1, '["tes"]'::jsonb, 1785237408546, false),
(1785241274979, 'asu', 'tes ajah', 0, '[]'::jsonb, 1785241274979, false),
(1785291628523, 'long P', 'siapa aja disini yang pernah vcs', 0, '["Video Call Sholat? aku pernah bang", "emang khysuk pas sholat sambil video call?", "Akbar", "alesan aja itu, habis sholad pasti minta liat pepek", "astaghfirullove"]'::jsonb, 1785291628523, false),
(1785316814053, 'pelicin rantai', 'sayang banget klo g digenit in inimah', 0, '["takut gay, kalo salah sasaran"]'::jsonb, 1785316814053, false),
(1785377737660, 'tambal ban pojok', 'siapa yang sok iye di grup, jujur aje gpp', 1, '["Jyujur yg bikin platform ini", "Jyujur yg suka cerita sex", "jujur gw", "mampus", "lo semua pada sok iye"]'::jsonb, 1785377737660, false),
(1785380416553, 'KHAM PANKS', 'collab caca x el maca dong', 0, '["Ayoo ngentod", "Kolab apaan", "udah pasti bokep", "collab unjuk kepunyaan loh ya"]'::jsonb, 1785380416553, false),
(1785381056976, 'kang tod', 'pengan punya sugar baby', 0, '["adakah duitnya daddy?"]'::jsonb, 1785381056976, false),
(1785381100127, 'es blewah segar', 'Siapa yg disiny gedeg sama wasil', 0, '["Gua", "lu doang kali"]'::jsonb, 1785381100127, false),
(1785498252440, 'akbar', 'nim 24523090 ipk 3.8', 0, '["nembak kah bg", "mana buktinya"]'::jsonb, 1785498252440, false),
(1785554170933, 'GARRIXERS', 'in the name of love, gw akan bertemu martin garrix tahun ini', 0, '[]'::jsonb, 1785554170933, false),
(1786076706168, 'Pak cikini', 'Wazil bau arak bali', 0, '[]'::jsonb, 1786076706168, false),
(1786681285914, 'pak cikini', 'Icang bau linggis jawa', 0, '["caca bau gersang bekasi"]'::jsonb, 1786681285914, false),
(1786688325146, 'pak cikini', 'jerry dan drian 🤝🥷', 0, '[]'::jsonb, 1786688325146, false),
(1787035222475, 'CEO PASAR GADANG BAWANG ABANG', 'Ez game', 0, '["ini sp jing"]'::jsonb, 1787035222475, false),
(1787035996108, 'trshssh', 'i put you on top', 0, '["malah the weekend"]'::jsonb, 1787035996108, false),
(1787042451173, 'Kontolll', 'Kontolll aswww', 1, '["Kontol lu semua Bgstt kecuali wazil"]'::jsonb, 1787042451173, false),
(1787042654847, 'FINDING NEMO', 'Wazil kontol', 0, '["mmg ajg wazil kontolllll", "WAZIL ASUUU, MUKA LANJIAO", "LANJIAO PUKIMAK LANGGG", "Wazil anjenggggggggg"]'::jsonb, 1787042654847, false),
(1787051427637, 'Kontol lu semua', 'Komtol lu semuanya bangsttt aswww pepek', 0, '[]'::jsonb, 1787051427637, false)
ON CONFLICT (id) DO UPDATE SET
alias = EXCLUDED.alias,
confession = EXCLUDED.confession,
upvotes = EXCLUDED.upvotes,
comments = EXCLUDED.comments,
timestamp = EXCLUDED.timestamp,
is_pinned = EXCLUDED.is_pinned;
