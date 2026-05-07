/**
 * seed — one-shot data seeders. Idempotent. Run with:
 *
 *   npx convex run seed:dra50         # creates DRA@50 + imports all guests
 *
 * The DRA@50 seed creates a public, name-list-claim event owned by whichever
 * user calls it (so when they sign in, /pulse/dra50 lights up with all 498
 * guests already linked to their tables). Re-running is safe — the event
 * lookup is by slug, and guest inserts are skipped when a row with the same
 * (eventId, name, tableNumber) already exists.
 *
 * Why a dedicated seed module: the standard `events.create` + `guests.bulkImport`
 * mutations require Stack JWT (host-owned). For seeding from `convex run`
 * we either need an admin auth context or an internal mutation that takes
 * an explicit hostId. We use the latter — pass --hostId when running, or
 * the action picks the first user it finds (handy in single-user dev).
 */
import { v } from "convex/values";
import { mutation, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// 498 rows parsed from the public Google Sheet. Header row (DRA@50 host
// section) tagged as table "Host"; numbered tables 1–34, A1–A6, C1–C6, plus
// "Bistro" overflow. Names preserve titles (Pastor/Mr./Mrs./etc.) verbatim.
const DRA50_GUESTS: Array<{ name: string; table: string }> = [
  { name: "DRA", table: "Host" },
  { name: "Deacon John Akhuetie", table: "Host" },
  { name: "Mr. Nigel-Efeose Akhuetie", table: "Host" },
  { name: "Mr. Hansel-Oseahume Akhuetie", table: "Host" },
  { name: "Mr. Denzel-Osose Akhuetie", table: "Host" },
  { name: "Ms. Stephanie Oforka", table: "Host" },
  { name: "Pastor Ebhodaghe Sylvester", table: "A1" },
  { name: "Deaconess Yvonne Ebhodaghe", table: "A1" },
  { name: "Pastor Folasade Imoagene", table: "A1" },
  { name: "Pastor Tunde Olufowora", table: "A1" },
  { name: "Deaconess Vivian Olufowora", table: "A1" },
  { name: "Pastor Joy Oseghale", table: "A1" },
  { name: "Pastor Anthony Oseghale", table: "A1" },
  { name: "Pastor Toro Bank-Omotoye", table: "A1" },
  { name: "Pastor Obehi Eremiokhale", table: "A1" },
  { name: "Pastor Debola Odimayo", table: "A1" },
  { name: "Mrs. Miracle Odili", table: "A2" },
  { name: "Pastor Val Odili", table: "A2" },
  { name: "Pastor Chris Ibhakhomu", table: "A2" },
  { name: "Pastor Ibhakhomu", table: "A2" },
  { name: "Pastor Richard Ododo", table: "A2" },
  { name: "Pastor Genevieve Ododo", table: "A2" },
  { name: "Pastor Don Okhuofu", table: "A2" },
  { name: "Pastor Anita Aguele", table: "A2" },
  { name: "Pastor George Oguachuba", table: "A2" },
  { name: "Pastor Moji Oguachuba", table: "A2" },
  { name: "Pastor Ekele Uhiara", table: "1" },
  { name: "Pastor Ike Nnoli", table: "1" },
  { name: "Deacon Ben Onyibe", table: "1" },
  { name: "Deaconess Bimpe Onyibe", table: "1" },
  { name: "Pastor Benjamin Ubido", table: "1" },
  { name: "Deaconess Elizabeth Ubido", table: "1" },
  { name: "Deacon Chuks Uzoka", table: "1" },
  { name: "Sis Chuks-Uzoka Sheri", table: "1" },
  { name: "Deacon Khimiye Denny Ajele", table: "1" },
  { name: "Deacon Emeka Nnamani", table: "1" },
  { name: "Pastor Stellla Thomas", table: "2" },
  { name: "Deacon Tope Adeyemi", table: "2" },
  { name: "Pastor Obasi Nwamadi", table: "2" },
  { name: "Deaconess Ebere Nwauzor", table: "2" },
  { name: "Deacon Chinenye Udeh", table: "2" },
  { name: "Deacon Obionu Jerry", table: "2" },
  { name: "Deacon Efechia Nakpodia", table: "2" },
  { name: "Deaconess Uzoma Ben-Ude", table: "2" },
  { name: "Deaconess Ifeoma Edema", table: "2" },
  { name: "Deacon Ignatius Edema", table: "2" },
  { name: "Mrs. Agnes Adekunle", table: "3" },
  { name: "Mrs. Nyegonum Benson Ayah", table: "3" },
  { name: "Mr. Benson Ayah", table: "3" },
  { name: "Mrs. Rosemary Nwume", table: "3" },
  { name: "Mrs. Pamela Shodipo", table: "3" },
  { name: "Mr. Tolu Shodipo", table: "3" },
  { name: "Mrs. Bolanle Alugo", table: "3" },
  { name: "Mrs. Ijeoma Ubosi", table: "3" },
  { name: "Mrs. Oge Umoh", table: "3" },
  { name: "Mrs. Yetunde Okereke", table: "3" },
  { name: "Deaconess Oluwayemisi Adeboyejo", table: "4" },
  { name: "Mr. Elvis Okunbor", table: "4" },
  { name: "Deaconess Tina Okunbor", table: "4" },
  { name: "Deacon Gbadebo Adeboyejo", table: "4" },
  { name: "Ms. Ena Asuru", table: "4" },
  { name: "Mr. Maxwell Ohangbon", table: "4" },
  { name: "Mrs. Tinyan Ohangbon", table: "4" },
  { name: "Mrs. Edokpa Isioma", table: "4" },
  { name: "Mrs. Osaretin Amaefula", table: "4" },
  { name: "Dcn Gerald Ikem", table: "4" },
  { name: "Deaconess Eleanor Adaralegbe", table: "5" },
  { name: "Mrs. Chichi Egbarin", table: "5" },
  { name: "Pastor Bolanle Shokunbi", table: "5" },
  { name: "Pastor Theophilus Owase", table: "5" },
  { name: "Pastor Uju Paulcy", table: "5" },
  { name: "Pastor Daisy Obiano", table: "5" },
  { name: "Mrs. Stella Maris Imumolen", table: "5" },
  { name: "Pastor Yinka Segun-Sobowale", table: "5" },
  { name: "Dcns Felicity Uduehi", table: "5" },
  { name: "Pastor Ivy Obiano", table: "5" },
  { name: "Pastor Alex Great Eigbiremolen", table: "6" },
  { name: "Mrs. Francesca Isi Igoche", table: "6" },
  { name: "Pastor Noel Anuge", table: "6" },
  { name: "Deaconess Blessing Anuge", table: "6" },
  { name: "Mr. Oni Eigbiremolen", table: "6" },
  { name: "Mr. Eigbiremolen Stanley", table: "6" },
  { name: "Ms. Charissa Eigbiremolen", table: "6" },
  { name: "Mr. Bryan Great Eigbiremolen", table: "6" },
  { name: "Mr. Eigbiremolen Allen Great", table: "6" },
  { name: "Master Corban Okunbor", table: "6" },
  { name: "Mr. Oseneme Anuge", table: "6" },
  { name: "Ms. Efuaose Anuge", table: "6" },
  { name: "Mrs. Maria Benjamin", table: "6" },
  { name: "Pastor Henry Amenkhienan", table: "6" },
  { name: "Mr. Emmanuel Amenkhienan", table: "6" },
  { name: "Pastor Comfort Amenkhienan", table: "6" },
  { name: "Mr. Jonathan Amenkhienan", table: "6" },
  { name: "Ms. Princess Ada Esenwa", table: "6" },
  { name: "Mrs. Enimien Joan Esenwa", table: "6" },
  { name: "Mrs. Ngozi Ohakim", table: "7" },
  { name: "Mr. Victor Ohakim", table: "7" },
  { name: "Pastor Aishet Jumbo", table: "7" },
  { name: "Mr. Clarence Jumbo", table: "7" },
  { name: "Deacon Adebayo Bodede", table: "7" },
  { name: "Mrs. Oluwabunmi Bodede", table: "7" },
  { name: "Mrs. Efe Usin", table: "7" },
  { name: "Mr. Effiong Usin", table: "7" },
  { name: "Deacon Wale Alabi", table: "7" },
  { name: "Ms. Eleazu Kelechi", table: "7" },
  { name: "Deacon Bamidele Onalaja", table: "7" },
  { name: "Deaconess Tolulope Onalaja", table: "7" },
  { name: "Sis Bethel Ehikioya", table: "7" },
  { name: "Deacon Kingsley Ehikioya", table: "7" },
  { name: "Deacon Uche Okugo", table: "7" },
  { name: "Deacon Ayo Adegboye", table: "7" },
  { name: "Mr. Vincent Udensi A.", table: "7" },
  { name: "Pastor Catherine Vincent-Udensi", table: "7" },
  { name: "Deaconess Akpa Oluwaseun", table: "7" },
  { name: "Deacon Akpa Jideofor", table: "7" },
  { name: "Mr. Victor Eiremiokhae", table: "9" },
  { name: "Mrs. Dorcas Eiremiokhae", table: "9" },
  { name: "Mr. Musa Ahonle", table: "9" },
  { name: "Mrs. Mariah Ahonle", table: "9" },
  { name: "Ms. Cassandra Eiremiokhae", table: "9" },
  { name: "Mr. Joseph Eiremiokhae", table: "9" },
  { name: "Mrs. Mary Eiremiokhae", table: "9" },
  { name: "Mrs. Mabel Eiremiokhae", table: "9" },
  { name: "Ms. Cynthia Eiremiokhae", table: "9" },
  { name: "Ms. Lilian Udoji", table: "9" },
  { name: "Mrs. Caroline Okhueleigbe", table: "10" },
  { name: "Mrs. Dorothy Usigbe", table: "10" },
  { name: "Mrs. Grace Iyayi", table: "10" },
  { name: "Mr. Mark Akhuetie", table: "10" },
  { name: "Mrs. Inegbedion Isimenmen", table: "10" },
  { name: "Mrs. Akhuetie Sari", table: "10" },
  { name: "Mrs. Benedicta Akhuetie", table: "10" },
  { name: "Mrs. Gift Akhuetie", table: "10" },
  { name: "Mr. Griffith Ehebha", table: "10" },
  { name: "Mrs. Edith Obasogie", table: "10" },
  { name: "Mr. Itua Akhuetie", table: "11" },
  { name: "Dr. Caroline Akhuetie", table: "11" },
  { name: "Dr. Michael Akhuetie", table: "11" },
  { name: "Sophia Akhuetie", table: "11" },
  { name: "Mr. Tunde Ogbedebi", table: "11" },
  { name: "Mrs. Gloria Ogbedebi", table: "11" },
  { name: "Ms. Akhuetie Obehi", table: "11" },
  { name: "Mr. Victor Akhuetie", table: "11" },
  { name: "Ms. Vanessa Akhuetie", table: "11" },
  { name: "Mr. Mudiaga Egbedi", table: "12" },
  { name: "Idahoise Sandra", table: "12" },
  { name: "Amao Bayo", table: "12" },
  { name: "Amao Susan", table: "12" },
  { name: "Sophia Umuro", table: "12" },
  { name: "Anaiah Umuro", table: "12" },
  { name: "Mrs. Eseoghene Anuge", table: "12" },
  { name: "Mr. Ernest Anuge", table: "12" },
  { name: "Mrs. Unyime Etura", table: "12" },
  { name: "Mrs. Laura Onyire", table: "12" },
  { name: "Deaconess Sophiya Ariba", table: "A6" },
  { name: "Pastor Ebos Adenubi", table: "A6" },
  { name: "Pastor Wole Adenubi", table: "A6" },
  { name: "Pastor Victory Amenkhienan", table: "A6" },
  { name: "Ms. Favour Amenkhienan", table: "A6" },
  { name: "Ms. Victory Oyakhilome", table: "A6" },
  { name: "Mrs. Peniel-Love Amenkhienan", table: "A6" },
  { name: "Mr. Johnny Amenkhienan", table: "A6" },
  { name: "Ms. Favour Ose Amenkhienan", table: "A6" },
  { name: "Ms. Ofure Amenkhienan", table: "A6" },
  { name: "Mrs. Faith Nwabuzor", table: "A6" },
  { name: "Mr. Nelson Nwabuzor", table: "A6" },
  { name: "Mrs. Lanre Ahonle", table: "A5" },
  { name: "Ms. Margaret Ahonle", table: "A5" },
  { name: "Mr. Moses Ahonle", table: "A5" },
  { name: "Ms. Omolefe Ahonle", table: "A5" },
  { name: "Mr. Mervyn Ahonle", table: "A5" },
  { name: "Ms. Precious Erabor", table: "A5" },
  { name: "Mr. Alex Jogoo", table: "A5" },
  { name: "Mr. Buchi Egwim", table: "A5" },
  { name: "Mrs. Tosin Egwin", table: "A5" },
  { name: "Mrs. Oluchi Richard-Oti", table: "13" },
  { name: "Mr. Richard Oti", table: "13" },
  { name: "Mr. Uhiara Nwabueze", table: "13" },
  { name: "Mrs. Vivien Uhiara", table: "13" },
  { name: "Mrs. Chima Ebor", table: "13" },
  { name: "Mr. Stephen Ebor", table: "13" },
  { name: "Mr. Shola Akinrinde", table: "13" },
  { name: "Ms. Lisa Uwangue", table: "13" },
  { name: "Mrs. Fatimah Omigie", table: "13" },
  { name: "Mr. Osaze Omigie", table: "13" },
  { name: "Deaconess Uzzo Dubem-Areh", table: "14" },
  { name: "Deaconess Angela Babalola", table: "14" },
  { name: "Deaconess Yoma Ayaoge", table: "14" },
  { name: "Deaconess Ifejola Adeyemi", table: "14" },
  { name: "Ms. Obioma Achilike", table: "14" },
  { name: "Deaconess Labake Ovono", table: "14" },
  { name: "Deacon Ochuko Aggreh", table: "14" },
  { name: "Mrs. Gloria Onosode", table: "14" },
  { name: "Mr. Oghenero Onosode", table: "14" },
  { name: "Ms. Isiagu Surline", table: "14" },
  { name: "Mrs. Fagbolagun Tola", table: "15" },
  { name: "Hon. Femi Barry Fagbolagun", table: "15" },
  { name: "Mr. Adolphus Okunbor", table: "15" },
  { name: "Mrs. Betty Okunbor", table: "15" },
  { name: "Deaconess Adesuwa Obaseki-Odiawa", table: "15" },
  { name: "Deacon Olalekan Ibrahim", table: "15" },
  { name: "Deacon Nestor Arabome", table: "15" },
  { name: "Mr. Victor Akinpelumi", table: "15" },
  { name: "Deaconess Uche Nwanze", table: "15" },
  { name: "Prince Benedict Okojie", table: "15" },
  { name: "Deacon Ovie Sagoh", table: "15" },
  { name: "Deacon Mordi Chukwuemeka", table: "15" },
  { name: "Mrs. Mordi Vivian", table: "15" },
  { name: "Deaconess Biodun Duze", table: "15" },
  { name: "Deacon Kayode Oshinaike", table: "15" },
  { name: "Mr. Godstime Okonofua", table: "15" },
  { name: "Pastor David Lasisi", table: "15" },
  { name: "Pastor David Lasisi's Guest", table: "15" },
  { name: "Pastor Olubayo Rotimi", table: "15" },
  { name: "Pastor Lauretta Olubayo", table: "15" },
  { name: "Pastor Ivy Obiano's Guest", table: "15" },
  { name: "Deaconess Nicky Ilo-Nwafor", table: "16" },
  { name: "Esteemed Minister Jerry Chira", table: "16" },
  { name: "Ms. Tonia Omobhude", table: "16" },
  { name: "Ms. Urenna Abazie", table: "16" },
  { name: "Deaconess Funmi Kuti", table: "16" },
  { name: "Deacon Bunmi Kuti", table: "16" },
  { name: "Ms. Nelly Samuel", table: "16" },
  { name: "Ms. Iddy Essien", table: "16" },
  { name: "Ms. Franca Hero", table: "16" },
  { name: "Mrs. Thelma Nnaji", table: "16" },
  { name: "Mrs. Batarhe Somefun", table: "16" },
  { name: "Mr. Bamidele Somefun", table: "16" },
  { name: "Mr. Daniel Somefun", table: "16" },
  { name: "Mr. David Somefun", table: "16" },
  { name: "Mr. Isi Esimike", table: "16" },
  { name: "Mrs. Francisca Esimike", table: "16" },
  { name: "Mr. Babatunde Ademosun", table: "16" },
  { name: "Deaconess Ademosun Sandra", table: "16" },
  { name: "Mr. Newton Iyeke", table: "16" },
  { name: "Mrs. Gozie Godrick", table: "16" },
  { name: "Deaconess Sandrah Daniels-Obarisiuwa", table: "17A" },
  { name: "Mr. Obarisiuwa Daniels", table: "17A" },
  { name: "Sister Sophia Oroleye", table: "17A" },
  { name: "Pastor Bimbo Ola-Solomon", table: "17A" },
  { name: "Mr. Eric Ola-Solomon", table: "17A" },
  { name: "Ms. Dorcas Deye", table: "17A" },
  { name: "Pastor Joseph Adebola", table: "17A" },
  { name: "Pastor Gift Oyaretor", table: "17A" },
  { name: "Mrs. Adebola Olufemi-Israel", table: "17A" },
  { name: "Mr. Olufemi-Israel", table: "17A" },
  { name: "Mr. Alex Ikechukwu Emenem", table: "19A" },
  { name: "Mrs. Hadassah Emenem", table: "19A" },
  { name: "Mr. Imuetiyan Gordons Agues", table: "19A" },
  { name: "Deaconess Patricia Imeabasi Ekwere", table: "19A" },
  { name: "Dcn Ekwere", table: "19A" },
  { name: "Pastor Precious Unwana", table: "19A" },
  { name: "Engr. Adebayo Opatola", table: "19A" },
  { name: "Ms. Adaeze Peters", table: "19A" },
  { name: "Ms. Chinenye Ozoduwa", table: "19A" },
  { name: "Mr. Emmanuel Abinye", table: "19A" },
  { name: "Dr. Ohiowele Ehizojie", table: "17C" },
  { name: "Mrs. Ohiowele Evbade", table: "17C" },
  { name: "Mr. Emmanuel Omuojine", table: "17C" },
  { name: "Dr. Blessing Ayemhere", table: "17C" },
  { name: "Ms. Frances Anaeto", table: "17C" },
  { name: "Ms. Frances Anaeto's Guest", table: "17C" },
  { name: "Mrs. Robinta Aluyi", table: "17C" },
  { name: "Mrs. Lara Coker", table: "17C" },
  { name: "Mr. Evans Akere", table: "17C" },
  { name: "Mrs. Imade Olubajo", table: "17C" },
  { name: "Mr. Akolawole Odunlami", table: "18C" },
  { name: "Mrs. Onobhamien Adodo", table: "18C" },
  { name: "Mrs. Eniola Odunlami", table: "18C" },
  { name: "Mr. Uhabia Ojike", table: "18C" },
  { name: "Mr. Moses Leo Mua'Zu", table: "18C" },
  { name: "Mr. Ayodeji Ojo", table: "18C" },
  { name: "Mr. Ayokunle Babalola", table: "18C" },
  { name: "Mr. Aliyu A Barde", table: "18C" },
  { name: "Mr. Oluyemi Abaolu-Johnson", table: "18C" },
  { name: "Dr. Idowu Shoaga", table: "18C" },
  { name: "Mrs. Chichi Emenike", table: "19C" },
  { name: "Mrs. Betty Idolor", table: "19C" },
  { name: "Mrs. Betty Idolor's Guest", table: "19C" },
  { name: "Mrs. Ifueko Judith Onwuegbu", table: "19C" },
  { name: "Mr. Anamelechi Onwuegbu", table: "19C" },
  { name: "Mrs. Nkechi Okeke", table: "19C" },
  { name: "Mrs. Mendy Akata", table: "19C" },
  { name: "Mr. Oyeleke Banmeke", table: "19C" },
  { name: "Mr. Mina Geoffrey", table: "19C" },
  { name: "Ms. Hannah Nwaoshai", table: "19C" },
  { name: "Mr. Anthony Sawyerr", table: "20" },
  { name: "Mrs. Adeola Oyegbade", table: "20" },
  { name: "Mr. Ifeanyi Ezeokoli", table: "20" },
  { name: "Dr. Victor Sodje", table: "20" },
  { name: "Engr. Akindele Ojo", table: "20" },
  { name: "Mr. Filani Oladapo", table: "20" },
  { name: "Mayor Olufemi Bakre", table: "20" },
  { name: "Mr. Adamu Lawani", table: "20" },
  { name: "Ms. Lawani Tonya", table: "20" },
  { name: "Mr. Daniel Braie", table: "20" },
  { name: "Mr. Charles Odita", table: "21" },
  { name: "Mrs. Charles Odita", table: "21" },
  { name: "Dr. Gabriel Ogbechie", table: "21" },
  { name: "Mrs. Godrey Ogbechie", table: "21" },
  { name: "Mr. Elamah Oseni", table: "21" },
  { name: "Mrs. Elamah Oseni", table: "21" },
  { name: "Mr. Valentine Ugbeide", table: "21" },
  { name: "Mr. Tunde Banjo", table: "21" },
  { name: "Mr. Kingsley Anyanwu", table: "21" },
  { name: "Uchechukwu Kingsley-Anyanwu", table: "21" },
  { name: "Olorogun Ortega Emerhor", table: "C1" },
  { name: "Madam Rita Emerhor", table: "C1" },
  { name: "Mrs. Obehi Okafor", table: "C1" },
  { name: "Mrs. Ibitoru Ubosi", table: "C1" },
  { name: "Mr. Mohammed Abubakar", table: "C1" },
  { name: "Mr. Aminu Waziri", table: "C1" },
  { name: "Mr. Elozino Olaniyan", table: "C1" },
  { name: "Ms. Okonedo Enase", table: "C1" },
  { name: "Mrs. Pamela Audu", table: "C1" },
  { name: "Mrs. Zena Enaholo", table: "C1" },
  { name: "Mr. Ekeno Ndebbio", table: "22" },
  { name: "Mr. Mark Enwongulu", table: "22" },
  { name: "Mrs. Enwongulu", table: "22" },
  { name: "Mr. Kayode Olatunbosun", table: "22" },
  { name: "Mr. Uche Nwamara", table: "22" },
  { name: "Mrs. Tari Akhibi", table: "22" },
  { name: "Mrs. Yewande Ajilore", table: "22" },
  { name: "Mr. Banji Ajilore", table: "22" },
  { name: "Mr. Majekodunmi Adeniyi", table: "22" },
  { name: "Mr. Adeche Omotosho-Oboro", table: "22" },
  { name: "Mr. Babatope Okusanya", table: "22" },
  { name: "Mrs. Oluwatoyin Okusanya", table: "22" },
  { name: "Mr. Okusolubo John", table: "22" },
  { name: "Dr. Gbenga Ajibua", table: "22" },
  { name: "Ms. Feyisara Obayemi", table: "22" },
  { name: "Mr. Anthony Okoye", table: "22" },
  { name: "Mr. Okenwa Kalu", table: "22" },
  { name: "Mrs. Love Uchegbu", table: "22" },
  { name: "Mr. Sunday Samuel", table: "22" },
  { name: "Dr. Nduka Okoisor", table: "22" },
  { name: "Mr. Alex Aghedo", table: "28" },
  { name: "Mrs. Odion Chigbufue", table: "28" },
  { name: "Mr. Chigbufue", table: "28" },
  { name: "Mr. James Ekainu", table: "28" },
  { name: "Mrs. Amaka Ekainu", table: "28" },
  { name: "Mr. Okechukwu Ngana", table: "28" },
  { name: "Ms. Maria Michael", table: "28" },
  { name: "Ms. Chiamaka Okonkwo", table: "28" },
  { name: "Mrs. Seyi Banigbe", table: "28" },
  { name: "Mr. Bolaji Adeyemi", table: "28" },
  { name: "Mr. Isioma Alabi", table: "27" },
  { name: "Dr. Morgan Oche", table: "27" },
  { name: "Mrs. Onome Olugbesan", table: "27" },
  { name: "Mr. Isaac Ero", table: "27" },
  { name: "Mrs. Isaac Ero", table: "27" },
  { name: "Mr. Glenn Ubohmhe", table: "27" },
  { name: "Mrs. Kemi Uddin", table: "27" },
  { name: "DRA's Guest", table: "27" },
  { name: "Mrs. Agbenisi", table: "27" },
  { name: "Mr. Olanrewaju Agbenisi", table: "27" },
  { name: "Ms. Yina Mimi", table: "24" },
  { name: "Mrs. Mabel Makun", table: "24" },
  { name: "Ms. Candius Diallo", table: "24" },
  { name: "Dr. Chuka Imo", table: "24" },
  { name: "Dr. Tope Mark Odigie", table: "24" },
  { name: "Ms. Delphine Okoronkwo", table: "24" },
  { name: "Dr. Trish Onumonu", table: "24" },
  { name: "Ms. Bally Tolu", table: "24" },
  { name: "Mrs. Susan Chanel", table: "24" },
  { name: "Mrs. Susan Chanel Guest", table: "24" },
  { name: "Mrs. Folasade Ogunwale", table: "26" },
  { name: "Mr. Oluseyi Ogunwale", table: "26" },
  { name: "Mrs. Jesutomipe Igbaroola", table: "26" },
  { name: "Ms. Tayo Olushola", table: "26" },
  { name: "Dr. Omolola Omotara", table: "26" },
  { name: "Ms. Claude-Wilcox Banke", table: "26" },
  { name: "Mr. Molham Naser", table: "26" },
  { name: "Mr. Olajide Taiwo", table: "26" },
  { name: "Ms. Funke Ajomale", table: "26" },
  { name: "Omotola Ogunji", table: "26" },
  { name: "Mr. Olamoneyso Nduka", table: "25" },
  { name: "Ms. Mary Oma-Williams", table: "25" },
  { name: "Ms. Mojirade Ojo", table: "25" },
  { name: "Ms. Josephine Ogunjobi", table: "25" },
  { name: "Mr. Gbenga Ikotun", table: "25" },
  { name: "Mrs. Omobolanle Ikotun", table: "25" },
  { name: "Ms. Oluwapelumi Adefule", table: "25" },
  { name: "Pastor Ime Thompson", table: "25" },
  { name: "Mrs. Christiana Emelue", table: "25" },
  { name: "Ms. Blessing Oti", table: "25" },
  { name: "Mrs. Olayinka Banjoko", table: "25" },
  { name: "Dr. Omowunmi Adebayo", table: "C6" },
  { name: "Mr. Ayodele Adebayo", table: "C6" },
  { name: "Mrs. Uche Ajaegbu-Bright", table: "C6" },
  { name: "Mrs. Taiye Aluko", table: "C6" },
  { name: "Mr. Jide Aluko", table: "C6" },
  { name: "Mr. Sonny Onyegbula", table: "C6" },
  { name: "Mrs. Bolaji Dada", table: "C6" },
  { name: "Mrs. Uyoyou-Agha Dumebi", table: "C6" },
  { name: "Dr. Mike Enwalie", table: "C6" },
  { name: "Chief Leslie Ezikpe", table: "C6" },
  { name: "Ms. Imelda Ezikpe", table: "29" },
  { name: "Mrs. Ezinne Mabawonku", table: "29" },
  { name: "Mrs. Omolara Adeyemi", table: "29" },
  { name: "Mrs. Kike Asuelime", table: "29" },
  { name: "Mr. Michael Asuelime", table: "29" },
  { name: "Mrs. Anietie Osagie", table: "29" },
  { name: "Mr. Emmanuel Dangana", table: "29" },
  { name: "Mrs. Helena Dangana", table: "29" },
  { name: "Ms. Elsie Uzoma", table: "29" },
  { name: "Mrs. Banjo Wonu", table: "29" },
  { name: "Pastor Matthew Okojie", table: "C5" },
  { name: "Mr. Bola Ibrahim", table: "C5" },
  { name: "Mr. Seyi Ogundipe", table: "C5" },
  { name: "Mr. Ayodeji Abimbola", table: "C5" },
  { name: "Mrs. Abodunrin Folukemi", table: "C5" },
  { name: "Barr. Chris Ebare", table: "C5" },
  { name: "Ms. Ojieabu Adesua", table: "C5" },
  { name: "Ms. Ose Ojieabu", table: "C5" },
  { name: "Mr. Chris Ojieabu", table: "C5" },
  { name: "Mrs. Adannia Awobokun", table: "30" },
  { name: "Mrs. Olufunke Ekundayo", table: "30" },
  { name: "Mrs. Nnenna Iwuagwu", table: "30" },
  { name: "Mrs. Serah Ogundele", table: "30" },
  { name: "Mrs. Esosa Efiannayi", table: "30" },
  { name: "Mrs. Awele Temiagin", table: "30" },
  { name: "Mr. Oludolapo Shofolu", table: "30" },
  { name: "Dr. Adaora Ugonwa", table: "30" },
  { name: "Mr. Ugonwa Chikwado", table: "30" },
  { name: "Mrs. Kelechi Ogbuaku", table: "30" },
  { name: "Ms. Jane Atimitse", table: "32" },
  { name: "Ms. Whitney Peejays", table: "32" },
  { name: "Mr. Tunde Smith", table: "32" },
  { name: "Mrs. Esther Odigie", table: "32" },
  { name: "Joesphine Odigie Konu", table: "32" },
  { name: "Patrick Peejay", table: "32" },
  { name: "Simi Smith", table: "32" },
  { name: "Ms. Temitope Alesh", table: "32" },
  { name: "Mrs. Ify Obi", table: "32" },
  { name: "Mrs. Ify Obi's Guest", table: "32" },
  { name: "Deacon Ikenna Ezenwoke", table: "34" },
  { name: "Pastor Luke Agbokhina", table: "34" },
  { name: "Ms. Jenny Ohiwerei", table: "34" },
  { name: "Mrs. Abiri Kelechi Hadassah", table: "34" },
  { name: "Mr. Victor Oseghale", table: "34" },
  { name: "Mr. Felix Iziengbeaya", table: "34" },
  { name: "Dr. Adetokunbo Ihensekhien", table: "34" },
  { name: "Dr. Ayodeji Jemilugba", table: "34" },
  { name: "Dr. Ayodeji Jemilugba's Guest", table: "34" },
  { name: "Ms. Chinoye Ogwa Favour", table: "34" },
  { name: "Rev. Magaret Modupe Olateju", table: "31" },
  { name: "Mrs. Ebitimi Chike Ijeh", table: "31" },
  { name: "Mr. Seyi Oluwadiran", table: "31" },
  { name: "Pastor Gladys Oladeinde", table: "31" },
  { name: "Mr. Kingsley Nwosu", table: "31" },
  { name: "Ms. Tijani Modinat", table: "31" },
  { name: "Mr. Fesojaye Ogunfowodu", table: "31" },
  { name: "Barrister Kemi Ogunfowodu", table: "31" },
  { name: "Mrs. Queen Sadat Momodu", table: "31" },
  { name: "Mr. Christopher Nwaneri", table: "31" },
  { name: "Pastor Olatunde Adeoti", table: "31" },
  { name: "Deaconess Alawaye Modupe", table: "31" },
  { name: "Sister Blessing Inoghie", table: "31" },
  { name: "Mrs. Adeleke-Iwakun Ogonna", table: "31" },
  { name: "Mr. Dopemu Lukman", table: "31" },
  { name: "Mr. Animashaun Wasiu", table: "31" },
  { name: "Mr. Adesoji Salu", table: "31" },
  { name: "Mr. Francis Osemakin", table: "31" },
  { name: "Ms. Maria Eniga", table: "31" },
  { name: "Ms. Justina Eniga", table: "31" },
  { name: "Mrs. Victoria Olaofe", table: "33" },
  { name: "Mr. Adesanya Adeyemi", table: "33" },
  { name: "Ms. Chioma Lawrieta", table: "33" },
  { name: "Mrs. Lawal Sherifat", table: "33" },
  { name: "Mr. Emuan Timothy", table: "33" },
  { name: "Mr. Niyi Adesanya", table: "33" },
  { name: "Mr. Alarape Taofik", table: "33" },
  { name: "Mr. Tajudeen Aremu", table: "33" },
  { name: "Ms. Iyitomi Ruth", table: "33" },
  { name: "Mr. Iyitomi Kayode", table: "33" },
  { name: "Engr. Tewogbade Akeem", table: "33" },
  { name: "Mrs. Bolanle Ibikunle (Nee Salami)", table: "33" },
  { name: "Mrs. Modinat Moses", table: "33" },
  { name: "Mrs. Rebecca Olumofin", table: "33" },
  { name: "Mr. Yusuf Mutairu", table: "33" },
  { name: "Mr. Femi Amune", table: "33" },
  { name: "Ms. Kabirat Yusuf", table: "33" },
  { name: "Mrs. Zumat Ajayi", table: "33" },
  { name: "Mrs. Bashiru Sherifat", table: "33" },
  { name: "Mr. David Ogbogu", table: "33" },
  { name: "Mr. Okoruwa Victor", table: "Bistro" },
  { name: "Mr. Okoruwa Victor's Guest", table: "Bistro" },
  { name: "Pastor Austin Olumese", table: "Bistro" },
  { name: "Pastor Florence Oluwatomi", table: "Bistro" },
  { name: "Deacon John Oulwatomi", table: "Bistro" },
  { name: "Mr. Onyedika Oha", table: "Bistro" },
  { name: "Mrs. Justina Oha", table: "Bistro" },
  { name: "Mrs. Alice Nwokobia", table: "Bistro" },
  { name: "Mr. Jacobs Onoja", table: "Bistro" },
];

/** Internal — pick the first user in the system; used as host when seeding
 *  in single-host dev setups. */
export const getFirstUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").first();
  },
});

/**
 * Idempotent DRA@50 seed. Creates the event if missing, imports any guest
 * rows that aren't already there. Safe to re-run.
 *
 *   npx convex run seed:dra50
 *
 * If you have multiple users in dev, pass a host explicitly:
 *
 *   npx convex run seed:dra50 '{"hostEmail":"you@example.com"}'
 */
export const dra50 = mutation({
  args: { hostEmail: v.optional(v.string()) },
  handler: async (
    ctx,
    { hostEmail },
  ): Promise<{ slug: string; eventId: Id<"events">; inserted: number; skipped: number; total: number }> => {
    // Resolve host: caller > by-email > first user.
    const identity = await ctx.auth.getUserIdentity();
    let host = null;
    if (identity) {
      host = await ctx.db
        .query("users")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .unique();
    }
    if (!host && hostEmail) {
      host = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", hostEmail))
        .unique();
    }
    if (!host) {
      host = await ctx.db.query("users").first();
    }
    if (!host) {
      throw new Error(
        "No user found to use as host. Sign in to the app once, then re-run.",
      );
    }

    // Find or create the event by slug "dra50".
    const slug = "dra50";
    let event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!event) {
      const id = await ctx.db.insert("events", {
        slug,
        hostId: host._id,
        title: "DRA@50",
        description:
          "Celebrating five decades of Deaconess R. Akhuetie. Find your seat below.",
        status: "active",
        memoryWallEnabled: "1",
        smsBroadcastEnabled: "0",
        isPublic: true,
        claimMode: "name-list",
        guestTokenSalt: Math.random().toString(36).slice(2),
        updatedAt: Date.now(),
      });
      event = await ctx.db.get(id);
    } else {
      // Idempotent re-config: ensure the event is public + name-list.
      await ctx.db.patch(event._id, {
        isPublic: true,
        claimMode: "name-list",
        memoryWallEnabled: "1",
        status: "active",
        updatedAt: Date.now(),
      });
    }
    if (!event) throw new Error("Failed to load event after seed");

    // Index existing guests on this event by (lowercased name, table) for
    // O(1) duplicate detection during the loop.
    const existing = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", event!._id))
      .collect();
    const seen = new Set<string>(
      existing.map((g) => `${g.name.trim().toLowerCase()}|${g.tableNumber ?? ""}`),
    );

    let inserted = 0;
    let skipped = 0;
    const now = Date.now();
    for (const row of DRA50_GUESTS) {
      const key = `${row.name.trim().toLowerCase()}|${row.table}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert("guests", {
        eventId: event._id,
        name: row.name,
        tableNumber: row.table,
        portalToken: undefined,
        notificationStatus: "skipped",
        checkedIn: "0",
        updatedAt: now,
      });
      seen.add(key);
      inserted += 1;
    }

    return {
      slug,
      eventId: event._id,
      inserted,
      skipped,
      total: DRA50_GUESTS.length,
    };
  },
});

/** Lightweight repair — recomputes table assignments on existing rows by
 *  matching name. Useful if you imported via CSV with stale table data. */
export const dra50FixTables = internalMutation({
  args: {},
  handler: async (ctx) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", "dra50"))
      .unique();
    if (!event) return { updated: 0, total: 0 };

    const rows = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect();
    const byName = new Map<string, string>();
    for (const r of DRA50_GUESTS) byName.set(r.name.trim().toLowerCase(), r.table);

    let updated = 0;
    for (const g of rows) {
      const want = byName.get(g.name.trim().toLowerCase());
      if (want && want !== g.tableNumber) {
        await ctx.db.patch(g._id, {
          tableNumber: want,
          updatedAt: Date.now(),
        });
        updated += 1;
      }
    }
    return { updated, total: rows.length };
  },
});
