// Marche e modelli suggeriti nel form di pubblicazione degli annunci
// (campi "Marca"/"Modello"/"Brand", vedi annunciSchema.js e SuggestInput
// in AnnunciFieldInputs.jsx): dalle prime due lettere digitate compaiono
// i nomi che iniziano così, poi quelli che le contengono. Liste
// compilate a mano (niente chiave API, funzionano anche offline); per i
// modelli di una marca fuori lista, o non ancora elencati, si chiede a
// Wikipedia in italiano (stesso approccio senza chiave della ricerca
// giochi in gaming.js). Il valore scelto resta testo libero: chi non
// trova la sua marca la scrive e basta.

const CAR_MODELS = {
  'Alfa Romeo': ['Giulia', 'Giulietta', 'Stelvio', 'Tonale', 'Junior', 'MiTo', '147', '156', '159', '166', 'GT', 'Brera', 'Spider', '4C', '8C', 'Giulia Quadrifoglio'],
  Abarth: ['500', '595', '695', '124 Spider', '500e', 'Punto Evo', 'Grande Punto'],
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'TT', 'R8', 'e-tron', 'e-tron GT', 'RS3', 'RS4', 'RS6', 'S3', 'S4'],
  BMW: ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'Serie 6', 'Serie 7', 'Serie 8', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'i5', 'i7', 'iX', 'iX1', 'iX3', 'M2', 'M3', 'M4', 'M5'],
  BYD: ['Atto 3', 'Dolphin', 'Seal', 'Seal U', 'Tang', 'Han'],
  Chevrolet: ['Spark', 'Aveo', 'Cruze', 'Captiva', 'Matiz', 'Camaro', 'Corvette', 'Orlando', 'Trax'],
  Citroën: ['C1', 'C2', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 Picasso', 'C5', 'C5 Aircross', 'C5 X', 'Berlingo', 'Jumpy', 'Jumper', 'Nemo', 'Xsara', 'Saxo', 'DS3', 'DS4', 'DS5', 'Ami', 'ë-C4'],
  Cupra: ['Formentor', 'Leon', 'Ateca', 'Born', 'Tavascan', 'Terramar'],
  Dacia: ['Sandero', 'Sandero Stepway', 'Duster', 'Logan', 'Jogger', 'Spring', 'Lodgy', 'Dokker', 'Bigster'],
  DS: ['DS 3', 'DS 3 Crossback', 'DS 4', 'DS 5', 'DS 7', 'DS 7 Crossback', 'DS 9'],
  Ferrari: ['296 GTB', '296 GTS', 'SF90 Stradale', 'F8 Tributo', 'Roma', 'Portofino', 'Purosangue', '812 Superfast', '488 GTB', '458 Italia', 'California', 'F430', '360 Modena', 'GTC4Lusso', 'FF', 'LaFerrari'],
  Fiat: ['500', '500X', '500L', '500e', '600', 'Panda', 'Grande Panda', 'Punto', 'Grande Punto', 'Punto Evo', 'Tipo', 'Bravo', 'Stilo', 'Uno', 'Multipla', 'Doblò', 'Qubo', 'Fiorino', 'Ducato', 'Scudo', 'Talento', 'Freemont', 'Sedici', 'Idea', 'Croma', '124 Spider', 'Topolino', 'Marea', 'Seicento', 'Cinquecento'],
  Ford: ['Fiesta', 'Focus', 'Puma', 'Kuga', 'EcoSport', 'Mondeo', 'Ka', 'Ka+', 'C-Max', 'S-Max', 'Galaxy', 'B-Max', 'Mustang', 'Mustang Mach-E', 'Explorer', 'Ranger', 'Transit', 'Transit Custom', 'Transit Connect', 'Tourneo Custom', 'Tourneo Connect', 'Edge', 'Bronco'],
  Honda: ['Jazz', 'Civic', 'HR-V', 'CR-V', 'ZR-V', 'e', 'e:Ny1', 'Accord', 'CR-Z', 'Insight', 'NSX', 'S2000', 'FR-V'],
  Hyundai: ['i10', 'i20', 'i30', 'i40', 'ix20', 'ix35', 'Kona', 'Bayon', 'Tucson', 'Santa Fe', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Getz', 'Atos', 'Matrix', 'Nexo'],
  Jaguar: ['XE', 'XF', 'XJ', 'F-Pace', 'E-Pace', 'I-Pace', 'F-Type', 'X-Type', 'S-Type'],
  Jeep: ['Renegade', 'Compass', 'Avenger', 'Wrangler', 'Cherokee', 'Grand Cherokee', 'Commander', 'Gladiator', 'Patriot'],
  Kia: ['Picanto', 'Rio', 'Ceed', 'ProCeed', 'XCeed', 'Stonic', 'Niro', 'Sportage', 'Sorento', 'EV3', 'EV6', 'EV9', 'Soul', 'Venga', 'Carens', 'Optima', 'Stinger'],
  Lamborghini: ['Huracán', 'Aventador', 'Urus', 'Revuelto', 'Gallardo', 'Murciélago', 'Temerario'],
  Lancia: ['Ypsilon', 'Delta', 'Musa', 'Thema', 'Voyager', 'Phedra', 'Lybra', 'Thesis', 'Kappa', 'Dedra', 'Fulvia', 'Beta'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Freelander'],
  Lexus: ['CT', 'IS', 'ES', 'GS', 'LS', 'UX', 'NX', 'RX', 'LBX', 'RZ', 'LC', 'RC'],
  Maserati: ['Ghibli', 'Quattroporte', 'Levante', 'Grecale', 'GranTurismo', 'GranCabrio', 'MC20', '3200 GT', 'Coupé', 'Spyder'],
  Mazda: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-80', 'MX-5', 'MX-30', 'CX-7', 'RX-8'],
  'Mercedes-Benz': ['Classe A', 'Classe B', 'Classe C', 'Classe E', 'Classe S', 'Classe G', 'Classe V', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'SL', 'SLK', 'SLC', 'AMG GT', 'Vito', 'Sprinter', 'Citan', 'Classe ML', 'Classe GLK'],
  MG: ['MG3', 'MG4', 'MG5', 'ZS', 'HS', 'EHS', 'Marvel R', 'Cyberster'],
  Mini: ['Mini 3 porte', 'Mini 5 porte', 'Cooper', 'Cooper S', 'One', 'Countryman', 'Clubman', 'Cabrio', 'Paceman', 'Aceman', 'Electric'],
  Mitsubishi: ['Space Star', 'Colt', 'ASX', 'Eclipse Cross', 'Outlander', 'L200', 'Pajero', 'Lancer'],
  Nissan: ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Leaf', 'Ariya', 'Note', 'Pulsar', 'Navara', 'Pathfinder', 'Murano', '370Z', 'GT-R', 'Primastar', 'Townstar'],
  Opel: ['Corsa', 'Corsa-e', 'Astra', 'Insignia', 'Mokka', 'Mokka-e', 'Crossland', 'Crossland X', 'Grandland', 'Grandland X', 'Meriva', 'Zafira', 'Adam', 'Karl', 'Agila', 'Antara', 'Combo', 'Vivaro', 'Movano', 'Frontera', 'Tigra', 'Vectra'],
  Peugeot: ['108', '206', '207', '208', 'e-208', '2008', 'e-2008', '307', '308', '3008', '407', '408', '508', '5008', '1007', '4007', '4008', 'RCZ', 'Rifter', 'Partner', 'Expert', 'Boxer', 'Traveller', 'iOn', 'Bipper'],
  Porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', 'Boxster', 'Cayman', '718', '928', '944'],
  Renault: ['Clio', 'Captur', 'Megane', 'Megane E-Tech', 'Scenic', 'Grand Scenic', 'Kadjar', 'Koleos', 'Austral', 'Arkana', 'Twingo', 'Zoe', 'Kangoo', 'Trafic', 'Master', 'Espace', 'Laguna', 'Modus', 'Symbioz', 'Rafale', '5 E-Tech', '4 E-Tech', 'Talisman', 'Wind'],
  Seat: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco', 'Alhambra', 'Altea', 'Toledo', 'Mii', 'Exeo', 'Cordoba'],
  Skoda: ['Fabia', 'Octavia', 'Superb', 'Scala', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq', 'Elroq', 'Citigo', 'Rapid', 'Yeti', 'Roomster'],
  Smart: ['fortwo', 'forfour', 'EQ fortwo', 'EQ forfour', '#1', '#3', 'roadster'],
  Subaru: ['Impreza', 'XV', 'Crosstrek', 'Forester', 'Outback', 'Levorg', 'Legacy', 'BRZ', 'WRX', 'Solterra'],
  Suzuki: ['Swift', 'Ignis', 'Vitara', 'S-Cross', 'Jimny', 'Across', 'Swace', 'Celerio', 'Alto', 'Splash', 'SX4', 'Grand Vitara', 'Baleno', 'Wagon R'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  Toyota: ['Yaris', 'Yaris Cross', 'Aygo', 'Aygo X', 'Corolla', 'Corolla Cross', 'C-HR', 'RAV4', 'Auris', 'Avensis', 'Prius', 'Camry', 'Land Cruiser', 'Hilux', 'Proace', 'Proace City', 'Supra', 'GR86', 'GR Yaris', 'bZ4X', 'Verso', 'iQ', 'Urban Cruiser', 'Highlander', 'Mirai'],
  Volkswagen: ['Polo', 'Golf', 'Golf Variant', 'Golf Plus', 'Golf Sportsvan', 'up!', 'e-up!', 'T-Cross', 'T-Roc', 'Taigo', 'Tiguan', 'Tiguan Allspace', 'Touareg', 'Touran', 'Sharan', 'Passat', 'Passat Variant', 'Arteon', 'ID.3', 'ID.4', 'ID.5', 'ID.7', 'ID. Buzz', 'Caddy', 'Transporter', 'Multivan', 'California', 'Crafter', 'Scirocco', 'Beetle', 'Maggiolino', 'Lupo', 'Fox', 'Jetta', 'Eos', 'Bora', 'Vento', 'Amarok'],
  Volvo: ['XC40', 'XC60', 'XC90', 'EX30', 'EX90', 'V40', 'V60', 'V70', 'V90', 'S60', 'S80', 'S90', 'C30', 'C40', 'C70'],
};

const MOTO_MODELS = {
  Aprilia: ['RS 660', 'Tuono 660', 'RS 457', 'RSV4', 'Tuono V4', 'Tuareg 660', 'Shiver', 'Dorsoduro', 'Pegaso', 'SR 50', 'SR GT', 'SR Motard', 'Scarabeo', 'RS 125', 'RS4 125', 'Tuono 125', 'RX 125', 'SX 125', 'Atlantic', 'Sportcity', 'Caponord', 'Mana', 'RS 50'],
  Benelli: ['TRK 502', 'TRK 502 X', 'TRK 702', 'TRK 251', 'Leoncino 500', 'Leoncino 800', 'Leoncino 125', 'BN 125', 'BN 302', '752 S', 'Imperiale 400', 'TNT 125', 'TNT 300', 'TNT 600'],
  Beta: ['RR 125', 'RR 300', 'RR 350', 'RR 390', 'RR 430', 'RR 480', 'RR 50', 'Alp 200', 'Alp 4.0', 'Xtrainer', 'Evo'],
  BMW: ['R 1250 GS', 'R 1300 GS', 'R 1200 GS', 'R 1250 RT', 'R 1250 R', 'R 1250 RS', 'R nineT', 'R 12', 'R 18', 'F 900 R', 'F 900 XR', 'F 900 GS', 'F 850 GS', 'F 800 GS', 'F 750 GS', 'F 700 GS', 'F 650 GS', 'G 310 R', 'G 310 GS', 'S 1000 RR', 'S 1000 R', 'S 1000 XR', 'M 1000 RR', 'C 400 X', 'C 400 GT', 'C 650 Sport', 'C 650 GT', 'CE 04', 'CE 02', 'K 1600 GT', 'K 1600 GTL', 'K 1300 S', 'R 1200 RT'],
  Ducati: ['Monster', 'Monster 821', 'Monster 1200', 'Monster 696', 'Monster 796', 'Panigale V2', 'Panigale V4', 'Panigale 899', 'Panigale 959', 'Panigale 1199', 'Panigale 1299', 'Streetfighter V2', 'Streetfighter V4', 'Multistrada V2', 'Multistrada V4', 'Multistrada 950', 'Multistrada 1200', 'Multistrada 1260', 'Scrambler Icon', 'Scrambler 800', 'Scrambler 1100', 'Scrambler Desert Sled', 'Scrambler Full Throttle', 'Diavel', 'Diavel V4', 'XDiavel', 'DesertX', 'Hypermotard 950', 'Hypermotard 698', 'Hypermotard 821', 'SuperSport', 'SuperSport 950', '848', '1098', '1198', '999', '749', '916', 'ST4', 'Supersport'],
  Fantic: ['Caballero 500', 'Caballero 125', 'Caballero 700', 'XEF 125', 'XEF 250', 'XMF 125', 'XXF 250', 'XX 125', 'Enduro 125', 'Motard 125', 'Stealth 250'],
  'Harley-Davidson': ['Sportster', 'Sportster S', 'Iron 883', 'Iron 1200', 'Forty-Eight', 'Nightster', 'Street Bob', 'Fat Bob', 'Fat Boy', 'Softail', 'Softail Slim', 'Heritage Classic', 'Low Rider', 'Low Rider S', 'Breakout', 'Road King', 'Street Glide', 'Road Glide', 'Electra Glide', 'Ultra Limited', 'Pan America', 'LiveWire', 'Street 750', 'Dyna', 'V-Rod', 'Night Rod', 'Road Glide Limited'],
  Honda: ['CB 125 R', 'CB 300 R', 'CB 500 F', 'CB 500 X', 'CB 500 Hornet', 'CB 650 R', 'CB 750 Hornet', 'CB 1000 R', 'CB 1000 Hornet', 'CBR 125 R', 'CBR 500 R', 'CBR 600 RR', 'CBR 650 R', 'CBR 1000 RR', 'CBR 1000 RR-R Fireblade', 'CRF 250 L', 'CRF 300 L', 'CRF 300 Rally', 'CRF 1100 L Africa Twin', 'CRF 1000 L Africa Twin', 'NC 750 X', 'NC 750 S', 'NC 700 X', 'X-ADV', 'ADV 350', 'ADV 150', 'Forza 125', 'Forza 300', 'Forza 350', 'Forza 750', 'SH 125', 'SH 150', 'SH 300', 'SH 350', 'SH Mode', 'PCX 125', 'Vision 110', 'Dio', 'Integra', 'Transalp', 'XL 750 Transalp', 'XL 700 V Transalp', 'Varadero', 'Hornet 600', 'Hornet 900', 'Rebel 500', 'Rebel 1100', 'Gold Wing', 'GL 1800', 'NT 1100', 'VFR 800', 'VFR 1200', 'Shadow 750', 'Monkey', 'MSX 125 Grom', 'Dax', 'Deauville', 'Silver Wing', 'Vfr', 'Dominator', 'XR 600', 'CBF 600', 'CBF 125', 'CB 600 F Hornet', 'CB 900 F Hornet', 'CBF 1000', 'CB 1300', 'CB 1100', 'VTR 1000', 'XRV 750 Africa Twin', 'CX 500', 'CBR 900 RR', 'CBR 929 RR', 'CBR 954 RR', 'CBR 600 F'],
  Husqvarna: ['Svartpilen 125', 'Svartpilen 401', 'Svartpilen 701', 'Svartpilen 801', 'Vitpilen 125', 'Vitpilen 401', 'Vitpilen 701', 'Norden 901', '701 Enduro', '701 Supermoto', 'TE 125', 'TE 250', 'TE 300', 'FE 250', 'FE 350', 'FE 450', 'FE 501', 'TC 125', 'TC 250', 'FC 250', 'FC 350', 'FC 450'],
  Indian: ['Scout', 'Scout Bobber', 'Chief', 'Chief Dark Horse', 'Chieftain', 'Springfield', 'Roadmaster', 'FTR 1200', 'Challenger', 'Pursuit', 'Sport Chief'],
  Kawasaki: ['Z 125', 'Z 400', 'Z 500', 'Z 650', 'Z 650 RS', 'Z 750', 'Z 800', 'Z 900', 'Z 900 RS', 'Z 1000', 'Z 1000 SX', 'Z H2', 'Ninja 125', 'Ninja 250', 'Ninja 300', 'Ninja 400', 'Ninja 500', 'Ninja 650', 'Ninja 1000 SX', 'Ninja ZX-6R', 'Ninja ZX-10R', 'Ninja ZX-4RR', 'Ninja H2', 'Ninja H2 SX', 'Versys 650', 'Versys 1000', 'Versys-X 300', 'Vulcan S', 'Vulcan 900', 'Vulcan 1700', 'Eliminator 500', 'KLX 230', 'KLX 300', 'KLR 650', 'ER-6n', 'ER-6f', 'ER-5', 'W 800', 'W 650', 'ZZR 1400', 'ZZR 600', 'GPZ 500', 'KX 250', 'KX 450', 'KLE 500', 'ZX-9R', 'ZX-12R'],
  KTM: ['125 Duke', '200 Duke', '250 Duke', '390 Duke', '690 Duke', '790 Duke', '890 Duke', '990 Duke', '1290 Super Duke R', '1390 Super Duke R', 'RC 125', 'RC 390', 'RC 8C', '390 Adventure', '790 Adventure', '890 Adventure', '890 Adventure R', '1090 Adventure', '1190 Adventure', '1290 Super Adventure', '690 Enduro R', '690 SMC R', '500 EXC-F', '450 EXC-F', '350 EXC-F', '300 EXC', '250 EXC', '125 SX', '250 SX-F', '450 SX-F', '990 Supermoto', '950 Adventure', '640 LC4', '620 Duke'],
  Kymco: ['Agility 125', 'Agility 50', 'Agility 200', 'Agility Plus', 'People S 125', 'People S 300', 'People One', 'Downtown 125', 'Downtown 300', 'Downtown 350', 'X-Town 125', 'X-Town 300', 'Xciting 400', 'Xciting S 400', 'Xciting 500', 'AK 550', 'Like 125', 'Like 150', 'DTX 360', 'Super 8', 'Dink', 'CV3', 'KRV 200', 'Grand Dink'],
  'Moto Guzzi': ['V7', 'V7 Stone', 'V7 Special', 'V7 III', 'V7 II', 'V9 Bobber', 'V9 Roamer', 'V85 TT', 'V100 Mandello', 'Stelvio', 'Griso', 'Breva', 'Norge', 'California', 'Audace', 'Eldorado', 'MGX-21', 'Nevada', 'Le Mans', '1000 SP', 'Bellagio', 'Sport 1200'],
  'MV Agusta': ['Brutale 800', 'Brutale 1000', 'Brutale 675', 'Brutale 910', 'Brutale 990', 'Dragster 800', 'F3 675', 'F3 800', 'F4', 'F4 1000', 'Turismo Veloce', 'Superveloce', 'Rush', 'Enduro Veloce', 'Lucky Explorer'],
  Piaggio: ['Beverly 300', 'Beverly 350', 'Beverly 400', 'Beverly 500', 'Beverly 125', 'Liberty 125', 'Liberty 150', 'Liberty 50', 'Medley 125', 'Medley 150', 'MP3 300', 'MP3 400', 'MP3 500', 'MP3 530', 'MP3 250', 'X10', 'X9', 'X8', 'X7', 'XEvo', 'Zip 50', 'Zip 100', 'Fly', 'Carnaby', 'Typhoon', 'NRG', 'Ciao', 'Bravo', 'Si', 'Ape', 'Porter'],
  'Royal Enfield': ['Classic 350', 'Classic 500', 'Bullet 350', 'Bullet 500', 'Meteor 350', 'Hunter 350', 'Himalayan', 'Himalayan 450', 'Scram 411', 'Interceptor 650', 'Continental GT 650', 'Super Meteor 650', 'Shotgun 650', 'Guerrilla 450', 'Bear 650'],
  Suzuki: ['GSX-R 125', 'GSX-R 600', 'GSX-R 750', 'GSX-R 1000', 'GSX-S 125', 'GSX-S 750', 'GSX-S 1000', 'GSX-S 1000 GT', 'GSX-8S', 'GSX-8R', 'GSX 1300 R Hayabusa', 'V-Strom 250', 'V-Strom 650', 'V-Strom 800', 'V-Strom 1000', 'V-Strom 1050', 'SV 650', 'SV 1000', 'Burgman 125', 'Burgman 200', 'Burgman 400', 'Burgman 650', 'Address 110', 'Bandit 600', 'Bandit 650', 'Bandit 1200', 'Bandit 1250', 'GSR 600', 'GSR 750', 'GSF 600', 'DR 650', 'DR-Z 400', 'DR 350', 'RM-Z 250', 'RM-Z 450', 'Intruder 800', 'Intruder 1500', 'Marauder', 'Katana', 'GS 500', 'TL 1000', 'RGV 250'],
  SYM: ['Symphony 125', 'Symphony ST', 'Symphony SR', 'Jet 14', 'Jet X', 'Jet 4', 'Fiddle 125', 'Fiddle II', 'Fiddle III', 'Crox', 'Orbit', 'HD 125', 'HD 300', 'Joymax Z', 'Joymax 300', 'Maxsym 400', 'Maxsym TL', 'Cruisym 300', 'ADX 125', 'Citycom', 'NH X', 'NH T', 'Wolf', 'Mio'],
  Triumph: ['Street Triple', 'Street Triple R', 'Street Triple RS', 'Speed Triple', 'Speed Triple RS', 'Speed 400', 'Scrambler 400 X', 'Trident 660', 'Tiger 660 Sport', 'Tiger 800', 'Tiger 850 Sport', 'Tiger 900', 'Tiger 900 Rally', 'Tiger 1050', 'Tiger 1200', 'Bonneville T100', 'Bonneville T120', 'Bonneville Bobber', 'Bonneville Speedmaster', 'Street Twin', 'Speed Twin', 'Speed Twin 900', 'Speed Twin 1200', 'Scrambler 900', 'Scrambler 1200', 'Thruxton', 'Thruxton RS', 'Rocket 3', 'Rocket III', 'Daytona 675', 'Daytona 660', 'Sprint ST', 'Sprint GT', 'Street Scrambler', 'Thunderbird', 'America'],
  Vespa: ['Primavera 50', 'Primavera 125', 'Primavera 150', 'Sprint 50', 'Sprint 125', 'Sprint 150', 'GTS 125', 'GTS 300', 'GTS Super', 'GTS Super Sport', 'GTV', 'LX 50', 'LX 125', 'LX 150', 'S 50', 'S 125', 'ET2', 'ET4', 'PX 125', 'PX 150', 'PX 200', 'PK 50', 'Elettrica', '946', 'Cosa', '50 Special', 'GT 200', 'GTS 250'],
  Yamaha: ['MT-03', 'MT-07', 'MT-09', 'MT-10', 'MT-125', 'MT-15', 'YZF-R1', 'YZF-R3', 'YZF-R6', 'YZF-R7', 'YZF-R125', 'YZF-R9', 'Tracer 7', 'Tracer 9', 'Tracer 700', 'Tracer 900', 'Ténéré 700', 'XT 660', 'XT 660 Z Ténéré', 'XT 1200 Z Super Ténéré', 'XT 600', 'XSR 125', 'XSR 700', 'XSR 900', 'FZ6', 'FZ1', 'FZ8', 'Fazer 600', 'Fazer 1000', 'FZS 600', 'XJ6', 'XJ 600', 'TDM 850', 'TDM 900', 'TMAX', 'TMAX 500', 'TMAX 530', 'TMAX 560', 'XMAX 125', 'XMAX 250', 'XMAX 300', 'XMAX 400', 'NMAX 125', 'NMAX 155', 'X-City', 'Majesty', 'Aerox', 'Neo\'s', 'Jog', 'BW\'s', 'D\'elight', 'Tricity', 'Niken', 'Virago', 'Drag Star', 'XVS 650', 'XVS 1100', 'FJR 1300', 'V-Max', 'WR 125', 'WR 250', 'WR 450', 'YZ 125', 'YZ 250', 'YZ 450', 'Bolt', 'SR 500', 'SR 400', 'XV 950', 'Diversion', 'TZR 50', 'DT 125', 'TT 600', 'R1', 'R6'],
};

const CAR_MAKES = [
  ...Object.keys(CAR_MODELS),
  'Aston Martin', 'Bentley', 'Cadillac', 'Chrysler', 'Daewoo', 'Daihatsu', 'Dodge', 'Dr', 'EVO', 'Genesis', 'GMC', 'Great Wall', 'Hummer', 'Infiniti', 'Isuzu', 'Iveco', 'Lada', 'Leapmotor', 'Lincoln', 'Lotus', 'Lynk & Co', 'Mahindra', 'McLaren', 'Microcar', 'Ligier', 'Aixam', 'Casalini', 'Chatenet', 'Omoda', 'Jaecoo', 'Polestar', 'Rolls-Royce', 'Rover', 'Saab', 'SsangYong', 'KGM', 'Tata', 'Xpeng', 'Nio', 'Lucid', 'Rivian', 'Alpine', 'Bugatti', 'Pagani', 'Morgan', 'Caterham', 'Fisker', 'Ineos', 'Aiways', 'Ora', 'Zeekr', 'Pontiac', 'Buick', 'Oldsmobile', 'Plymouth', 'Austin', 'Innocenti', 'Autobianchi', 'De Tomaso', 'Bertone',
];

const MOTO_MAKES = [
  ...Object.keys(MOTO_MODELS),
  'Askoll', 'Bajaj', 'Bimota', 'Brixton', 'BSA', 'Buell', 'Cagiva', 'CFMoto', 'Derbi', 'Energica', 'F.B. Mondial', 'Gas Gas', 'Gilera', 'Hanway', 'Hyosung', 'Italjet', 'Keeway', 'Kove', 'Lambretta', 'Laverda', 'Lifan', 'Malaguti', 'Mash', 'MBK', 'Moto Morini', 'Niu', 'Norton', 'Peugeot Motocycles', 'Polini', 'QJ Motor', 'Rieju', 'Sherco', 'Silence', 'Super Soco', 'Swm', 'TM Racing', 'Ural', 'Vent', 'Victory', 'Voge', 'Wottan', 'Zero Motorcycles', 'Zontes', 'Yadea', 'Segway', 'Quadro', 'Ecooter', 'Horwin', 'Motron', 'Orcal', 'Mutt', 'Macbor', 'Cezeta', 'BRP Can-Am', 'Ossa', 'Montesa', 'Sachs', 'Adly', 'Baotian', 'Znen',
];

const BIKE_MAKES = [
  'Bianchi', 'Pinarello', 'Colnago', 'Cannondale', 'Trek', 'Specialized', 'Giant', 'Scott', 'Cube', 'Canyon', 'BMC', 'Cervélo', 'Wilier', 'De Rosa', 'Cinelli', 'Basso', 'Olmo', 'Bottecchia', 'Atala', 'Legnano', 'Lombardo', 'Montana', 'Whistle', 'Carraro', 'Torpado', 'Esperia', 'Cicli Cinzia', 'Fausto Coppi', 'Merida', 'Orbea', 'Bergamont', 'Focus', 'Ghost', 'Haibike', 'KTM', 'Lapierre', 'Look', 'Ridley', 'Santa Cruz', 'Yeti', 'Kona', 'Marin', 'Norco', 'Rocky Mountain', 'Commencal', 'Mondraker', 'Nukeproof', 'YT Industries', 'Propain', 'Radon', 'Rose', 'Stevens', 'Storck', 'Felt', 'Fuji', 'Bulls', 'Corratec', 'Conway', 'Kalkhoff', 'Gazelle', 'Riese & Müller', 'Moustache', 'Tern', 'Brompton', 'Dahon', 'Fantic', 'Thok', 'Ducati', 'Olympia', 'Vittoria', 'Bottecchia', 'Decathlon', 'Btwin', 'Rockrider', 'Van Rysel', 'Triban', 'Elops', 'Rebel', 'Cowboy', 'VanMoof', 'Ampler', 'Fiido', 'Xiaomi', 'Himo', 'Engwe', 'Ado', 'Nilox', 'Argento', 'Jeep E-Bikes', 'Ducati E-Bikes', 'Lombardo', 'Frejus', 'Cicli Adriatica', 'Coppi', 'Dino Bikes', 'Bici Italia', 'MBM', 'Via Veneto', 'Ceres', 'Cicli Elios', 'Devron', 'GT', 'Mongoose', 'Schwinn', 'Raleigh', 'Peugeot', 'Sunn', 'Massi', 'Megamo', 'Winora', 'Diamant', 'Pegasus', 'Flyer', 'Stromer', 
];

const BOAT_MAKES = [
  'Azimut', 'Benetti', 'Ferretti', 'Riva', 'Pershing', 'Cranchi', 'Sessa Marine', 'Absolute', 'Sanlorenzo', 'Baglietto', 'Fiart Mare', 'Rio Yachts', 'Italmar', 'Invictus', 'Rancraft', 'Salpa', 'Saver', 'Ranieri', 'Marinello', 'Marino', 'Selva Marine', 'Idea Marine', 'Nautica Bertoni', 'Beneteau', 'Jeanneau', 'Bavaria', 'Hanse', 'Dufour', 'Dehler', 'Elan', 'Grand Soleil', 'Comar', 'Solaris', 'Mylius', 'Nautor Swan', 'Hallberg-Rassy', 'Najad', 'X-Yachts', 'J/Boats', 'Catalina', 'Hunter', 'Lagoon', 'Fountaine Pajot', 'Leopard', 'Bali', 'Nautitech', 'Sea Ray', 'Bayliner', 'Boston Whaler', 'Chaparral', 'Four Winns', 'Regal', 'Cobalt', 'Princess', 'Sunseeker', 'Fairline', 'Sealine', 'Prestige', 'Galeon', 'Zodiac', 'Joker Boat', 'BWA', 'Capelli', 'Lomac', 'Nuova Jolly', 'Marlin', 'Scanner', 'Sacs', 'Novamarine', 'Mar-Co', 'Zar Formenti', 'Tecnorib', 'Pirelli', 'Highfield', 'Brig', 'Honda Marine', 'Yamaha Marine', 'Mercury', 'Suzuki Marine', 'Tohatsu', 'Evinrude', 'Volvo Penta', 'Selva', 'Sea-Doo', 'Kawasaki Jet Ski', 'Yamaha WaveRunner', 'Quicksilver', 'Ranger Boats', 'Terhi', 'Whaly', 'Mano Marine', 'Tullio Abbate', 'Itama', 'Cantieri di Sarnico', 'Mochi Craft', 'Apreamare', 'Aprea', 'Gozzo Sorrentino', 'Cantieri Estensi', 'Portofino Marine', 'Wellcraft', 'Glastron', 'Rinker', 'Silverton', 'Carver', 'Wally', 'Frauscher', 'Windy', 'Axopar', 'Saxdor', 'Nimbus', 'Sargo', 'Botnia Targa', 'Fjord', 'Dinghy', 'Optimist', 'Laser', 'Hobie Cat', 'Nacra',
];

const CLOTHING_BRANDS = [
  'Adidas', 'Nike', 'Puma', 'Reebok', 'New Balance', 'Asics', 'Converse', 'Vans', 'Fila', 'Kappa', 'Champion', 'Under Armour', 'Jordan', 'Diadora', 'Lotto', 'Umbro', 'Le Coq Sportif', 'Ellesse', 'Sergio Tacchini', 'Australian', 'Gucci', 'Prada', 'Versace', 'Armani', 'Emporio Armani', 'Giorgio Armani', 'Armani Exchange', 'Dolce & Gabbana', 'Fendi', 'Valentino', 'Moschino', 'Love Moschino', 'Bottega Veneta', 'Salvatore Ferragamo', 'Tod\'s', 'Hogan', 'Max Mara', 'Miu Miu', 'Etro', 'Missoni', 'Trussardi', 'Roberto Cavalli', 'Just Cavalli', 'Ermenegildo Zegna', 'Zegna', 'Brunello Cucinelli', 'Loro Piana', 'Moncler', 'Stone Island', 'C.P. Company', 'Diesel', 'Replay', 'Gas', 'Liu Jo', 'Pinko', 'Patrizia Pepe', 'Elisabetta Franchi', 'Twinset', 'Guess', 'Calvin Klein', 'Tommy Hilfiger', 'Ralph Lauren', 'Polo Ralph Lauren', 'Lacoste', 'Fred Perry', 'Levi\'s', 'Wrangler', 'Lee', 'Carhartt', 'Carhartt WIP', 'Dickies', 'Timberland', 'Dr. Martens', 'Clarks', 'Geox', 'Nero Giardini', 'Frau', 'Church\'s', 'Santoni', 'Alberto Guardiani', 'Superga', 'Birkenstock', 'Crocs', 'UGG', 'Havaianas', 'Zara', 'H&M', 'Bershka', 'Pull&Bear', 'Stradivarius', 'Mango', 'Massimo Dutti', 'Uniqlo', 'Primark', 'OVS', 'Terranova', 'Alcott', 'Piazza Italia', 'Motivi', 'Oltre', 'Camaïeu', 'Benetton', 'United Colors of Benetton', 'Sisley', 'Napapijri', 'The North Face', 'Patagonia', 'Columbia', 'Salomon', 'Merrell', 'Colmar', 'Peuterey', 'Woolrich', 'Canada Goose', 'Herno', 'Fay', 'Blauer', 'Refrigiwear', 'K-Way', 'Ciesse Piumini', 'Invicta', 'Seven', 'Eastpak', 'Herschel', 'Michael Kors', 'Coach', 'Furla', 'Coccinelle', 'Piquadro', 'Braccialini', 'Carpisa', 'Longchamp', 'Louis Vuitton', 'Chanel', 'Dior', 'Hermès', 'Saint Laurent', 'Balenciaga', 'Givenchy', 'Celine', 'Loewe', 'Burberry', 'Off-White', 'Palm Angels', 'Supreme', 'Stüssy', 'Obey', 'Vans', 'Rolex', 'Omega', 'Tag Heuer', 'Breitling', 'Cartier', 'Bulgari', 'Tissot', 'Seiko', 'Casio', 'G-Shock', 'Swatch', 'Citizen', 'Fossil', 'Daniel Wellington', 'Garmin', 'Apple Watch', 'Pandora', 'Swarovski', 'Tiffany & Co.', 'Morellato', 'Breil', 'Nomination', 'Stroili', 'Ray-Ban', 'Oakley', 'Persol', 'Police', 'Carrera', 'Sundek', 'Calzedonia', 'Intimissimi', 'Tezenis', 'Yamamay', 'Golden Goose', 'Philippe Model', 'Premiata', 'Hugo Boss', 'Boss', 'Hugo', 'Scotch & Soda', 'Jack & Jones', 'Only', 'Vero Moda', 'Desigual', 'Superdry', 'Abercrombie & Fitch', 'Hollister', 'Gap', 'American Eagle', 'Brandy Melville', 'Shein', 'Decathlon', 'Kipsta', 'Quechua', 'Domyos', 'Alpha Industries', 'Schott', 'Belstaff', 'Barbour', 'Aspesi', 'Boglioli', 'Lardini', 'Tagliatore', 'Corneliani', 'Canali', 'Kiton', 'Brioni', 'Harmont & Blaine', 'Sun68', 'North Sails', 'Slam', 'Marina Yachting', 'Paul & Shark', 'Aeronautica Militare', 'Alviero Martini', 'Camomilla Italia', 'Kocca', 'Silvian Heach', 'Denny Rose', 'Fracomina', 'Nenette', 'Marella', 'Pennyblack', 'Weekend Max Mara', 'iBlues', 'Marina Rinaldi', 'Elena Mirò', 'Persona', 'Fiorella Rubino', 'Rinascimento', 'Imperial', 'Please', 'Gaudì', 'Sisley', 'Original Marines', 'Chicco', 'Prénatal', 'Mayoral', 'Monnalisa', 'Il Gufo', 'Petit Bateau', 'Okaïdi',
];

// Ordinamento dei suggerimenti: prima chi inizia con il testo digitato, poi
// chi lo contiene (es. "ro" → "Rolex" prima di "Alfa Romeo"); a parità,
// ordine alfabetico. Confronto senza accenti né maiuscole, così "Citroen"
// trova "Citroën" e "mercedes" trova "Mercedes-Benz".
function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export const SUGGEST_MIN_CHARS = 2;
const SUGGEST_MAX = 8;

export function rankMatches(list, text, max = SUGGEST_MAX) {
  const q = normalize(text);
  if (q.length < SUGGEST_MIN_CHARS) return [];
  const seen = new Set();
  const starts = [];
  const contains = [];
  for (const item of list) {
    const n = normalize(item);
    if (seen.has(n)) continue;
    seen.add(n);
    if (n.startsWith(q)) starts.push(item);
    else if (n.includes(q) || n.replace(/[\s\-.']/g, '').includes(q.replace(/[\s\-.']/g, ''))) contains.push(item);
  }
  const byName = (a, b) => a.localeCompare(b, 'it');
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, max);
}

const MAKES_BY_CATEGORY = {
  auto: CAR_MAKES,
  moto: MOTO_MAKES,
  biciclette: BIKE_MAKES,
  barche: BOAT_MAKES,
  abbigliamento: CLOTHING_BRANDS,
  'oggetti-vari': [...new Set([...CLOTHING_BRANDS.slice(0, 20), 'Apple', 'Samsung', 'Sony', 'LG', 'Huawei', 'Xiaomi', 'Bosch', 'De\'Longhi', 'Philips', 'Dyson', 'Ikea', 'Lego', 'Nintendo', 'PlayStation', 'Xbox', 'Canon', 'Nikon', 'GoPro', 'JBL', 'Bose', 'Beats', 'Garmin', 'Fitbit', 'Kenwood', 'Bialetti', 'Smeg', 'Whirlpool', 'Electrolux', 'Miele', 'Candy', 'Hoover', 'Rowenta', 'Braun', 'Oral-B', 'Nespresso', 'Lavazza', 'Nutribullet', 'Moulinex', 'Tefal', 'Lagostina', 'Alessi', 'Kartell', 'Poltrona Frau', 'Natuzzi', 'Calligaris', 'Mondo Convenienza', 'Maisons du Monde', 'Chicco', 'Cam', 'Inglesina', 'Peg Perego', 'Bugaboo', 'Cybex', 'Stokke', 'Hasbro', 'Mattel', 'Playmobil', 'Ravensburger', 'Clementoni', 'Fisher-Price', 'Barbie', 'Hot Wheels', 'Technogym', 'Decathlon', 'Domyos', 'Kettler', 'Thule', 'Samsonite', 'Roncato', 'American Tourister', 'Kindle', 'Amazon', 'Google', 'Microsoft', 'Lenovo', 'HP', 'Dell', 'Asus', 'Acer', 'MSI', 'Logitech', 'Razer', 'Corsair', 'Nvidia', 'AMD', 'Intel', 'Epson', 'Brother', 'Roomba', 'iRobot', 'Ecovacs', 'Roborock', 'Yamaha', 'Fender', 'Gibson', 'Ibanez', 'Roland', 'Korg', 'Casio', 'Pioneer', 'Technics', 'Marshall', 'Sonos', 'Bang & Olufsen', 'Sennheiser', 'Weber', 'Ooni', 'Napoleon', 'Husqvarna', 'Stihl', 'Black+Decker', 'Makita', 'DeWalt', 'Einhell', 'Hilti', 'Kärcher', 'Gardena', 'Fiskars', 'Tucano Urbano', 'Givi', 'Shad', 'Kappa', 'AGV', 'Shoei', 'Arai', 'Nolan', 'Alpinestars', 'Dainese', 'Rev\'it', 'Ixon'])],
};

const MODELS_BY_CATEGORY = { auto: CAR_MODELS, moto: MOTO_MODELS };

// Marche/brand della categoria che combaciano con il testo digitato.
export function suggestMakes(categoria, text) {
  return rankMatches(MAKES_BY_CATEGORY[categoria] ?? [], text);
}

function findMakeKey(categoria, make) {
  const models = MODELS_BY_CATEGORY[categoria];
  if (!models) return null;
  const q = normalize(make);
  if (!q) return null;
  return Object.keys(models).find((k) => normalize(k) === q) ?? Object.keys(models).find((k) => normalize(k).startsWith(q) || q.startsWith(normalize(k))) ?? null;
}

// Modelli noti per la marca indicata (lista locale). Vuoto se la marca non
// è tra quelle con i modelli precompilati.
export function suggestModelsLocal(categoria, make, text) {
  const key = findMakeKey(categoria, make);
  if (!key) return [];
  return rankMatches(MODELS_BY_CATEGORY[categoria][key], text);
}

// Fallback Wikipedia (it) con prefisso "marca testo": per una marca non in
// lista o un modello mancante. Titoli tipo "Fiat Panda (2011)" → "Panda";
// scartati quelli che non iniziano con la marca (pagine non pertinenti).
const WIKI_URL = 'https://it.wikipedia.org/w/api.php';
const wikiCache = new Map();

export async function suggestModelsWikipedia(make, text, signal) {
  const m = String(make ?? '').trim();
  const t = String(text ?? '').trim();
  if (!m || t.length < SUGGEST_MIN_CHARS) return [];
  const key = normalize(`${m} ${t}`);
  if (wikiCache.has(key)) return wikiCache.get(key);
  try {
    const params = new URLSearchParams({
      action: 'opensearch',
      format: 'json',
      origin: '*',
      limit: '10',
      namespace: '0',
      search: `${m} ${t}`,
    });
    const res = await fetch(`${WIKI_URL}?${params}`, { signal });
    if (!res.ok) return [];
    const json = await res.json();
    const titles = Array.isArray(json?.[1]) ? json[1] : [];
    const nm = normalize(m);
    const out = [];
    for (const title of titles) {
      const clean = String(title).replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (!normalize(clean).startsWith(nm)) continue;
      const model = clean.slice(m.length).trim().replace(/^[-–—:]\s*/, '');
      if (!model || normalize(model) === nm) continue;
      if (!out.some((x) => normalize(x) === normalize(model))) out.push(model);
    }
    if (wikiCache.size > 200) wikiCache.delete(wikiCache.keys().next().value);
    wikiCache.set(key, out);
    return out;
  } catch {
    return [];
  }
}

// Suggerimenti per il campo Modello: prima la lista locale; se ne trova
// meno di 3 (marca fuori lista o modello raro) integra con Wikipedia.
export async function suggestModels(categoria, make, text, signal) {
  const local = suggestModelsLocal(categoria, make, text);
  if (local.length >= 3 || !make) return local;
  const wiki = await suggestModelsWikipedia(make, text, signal);
  const merged = [...local];
  for (const w of wiki) if (!merged.some((x) => normalize(x) === normalize(w))) merged.push(w);
  return merged.slice(0, SUGGEST_MAX);
}
