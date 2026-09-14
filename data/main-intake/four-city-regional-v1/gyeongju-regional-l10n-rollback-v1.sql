-- gyeongju-regional-l10n ROLLBACK v1 — 실행 금지(Owner 지시 시에만 정확 1회).
-- 조건: 각 키는 apply(sha 196fe6fc…)가 넣은 값과 정확히 일치할 때만 제거된다 —
--        이후 다른 갱신이 덮은 값은 건드리지 않는다(그 경우 해당 문은 0행).
-- 근거: before snapshot(gyeongju-l10n-before-snapshot-2026-09-14-v1.json)이 대상
--        키 전부 부재를 증명하므로 '키 제거' = 원상 복귀다.
-- 총 35문(= 적용된 35 언어 키).
BEGIN;

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 425 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Gyerim Forest (경주 계림)';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 425 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Gyerim Forest is located between the Cheomseongdae Observatory and Wolseong Fortress. The forest is thickly populated by ancient zelkova and willow trees rooted on gently sloping hills and along the small stream in the northwest part of the woods. According to legend, the forest is closely associated with myths surrounding the birth of Alji, the founder of the Gyeongju Kim clan. As such, it is designated national Historic Site No. 19.  Legend has it that King Talhae heard a rooster crying from deep inside the Sirim Woods. Chancellor Hogong was sent to investigate. Upon arriving, he found a rooster crying underneath a tree on which hung a golden box. Hogong immediately reported his find to the king, who instructed him to bring the golden box into the palace. The king opened the box and found a small child inside, Kim Alji. The forest, which had previously been called ‘Sirim’ or ‘Gurim’, became known as ‘Gyerim’, (''gye’ meaning rooster). The name Gyerim was also used to refer to the Silla kingdom. Alji was adopted as the king’s son, but because the crown was passed on to King Pasa of the Park family, he never ascended the throne. The Kim clan later became the royal bloodline with the coronation of King Naemul some years later.  The memorial stone recording the birth of Kim Alji was erected in the third year of King Sunjo''s rule in the Joseon dynasty. Located close to the royal fortress of Silla, the forest is still deeply revered as the mystical birthplace of the first ancestor of the royal Kim clan of Silla. Yellow canola blossoms along the path connecting Daereungwon with Gyerim and Banwolseong only add to the magical ambiance of the forest.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju National Museum (국립경주박물관)';

UPDATE city_spots SET name_l10n = name_l10n - 'ja', updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND name_l10n->>'ja' = '国立慶州博物館';

UPDATE city_spots SET name_l10n = name_l10n - 'zh', updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND name_l10n->>'zh' = '国立庆州博物馆';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Gyeongju National Museum houses numerous historical and cultural artifacts of the Silla dynasty (57 BC-AD 935). The museum provides various programs including at the Children’s Museum School. The newly renovated Silla Art Gallery and Silla History Gallery lobby by Teoyang Studio are popular among visitors. This multi-complex center provides the history of Silla with various artifacts.';

UPDATE city_spots SET desc_l10n = desc_l10n - 'ja', updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND desc_l10n->>'ja' = '新羅千年の首都「慶州」に位置する国立慶州博物館は、新羅の文化遺産が一同に集結した韓国を代表する博物館です。';

UPDATE city_spots SET desc_l10n = desc_l10n - 'zh', updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND desc_l10n->>'zh' = '位于新罗千年首都庆州的国立庆州博物馆是可以纵观新罗文化遗产的韩国代表性博物馆。';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 436 AND city = 'gyeongju' AND name_l10n->>'en' = 'Cheonmachong Tomb (Daereungwon Ancient Tombs)';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 436 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Daereungwon Ancient Tombs are one of the most well-known sights in Gyeongju, a history park home to 23 small and large ancient tombs. The area is dotted with tranquil trails among the tombs like the largest tomb in Hwangnam-dong, Hwangnamdaechong Tomb; Cheonmachong Tomb, the place where Cheonmado, a saddle flap painting, was excavated from; and the tomb of King Michu, nicknamed the "Tomb of the Bamboo Warrior."

Cheonmachong Tomb, excavated in 1973, has a height of 12.7 meters and a diameter of 50 meters. Its excavation unearthed many artifacts, such as the famous Gold Crown from Cheonmachong Tomb. Its name comes from Cheonmado, a mudguard saddle flap with a painting of a heavenly horse. Cheonmachong Tomb is the only tomb in the Daereungwon Ancient Tombs to be opened to the public. The tomb is thought to have been constructed between the late 5th century and early 6th century. Artifacts excavated from the tomb include a gold crown, gold cap, gold waist belt, gold diadem, and gilt-bronze shoes worn by the buried. The gold crown, in particular, is known as the largest and the most elaborate of all gold crowns unearthed in Korea. The artifacts themselves can be found in Gyeongju National Museum.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 439 AND city = 'gyeongju' AND name_l10n->>'en' = 'Donggung Palace and Wolji Pond';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 439 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Donggung Palace and Wolji Pond in Gyeongju are secondary palace sites of Silla. The palace, along with other secondary palaces, was used as the eastern palace where the prince lived, and banquets were held during auspicious events or to welcome important guests. It is also where King Gyeongsun of Silla invited King Wang Geon of Goryeo and had a feast to complain about the critical situation in 931 after being invaded by Gyeon Hwon. After unifying the three kingdoms, Silla''s King Munmu dug a large pond in the 14th year of his reign (674), creating three islands in the center of the pond along with a 12-peaked mountain to the northeast. Beautiful flowers and trees were planted here, and rare birds and animals were raised. In the Samguksagi (History of the Three Kingdoms) from the Goryeo dynasty, there is only a record of Imhaejeon Hall and no mention of Anapji Pond. After Silla fell and the place fell into ruins during the Goryeo and Joseon dynasties, poets and calligraphers looked at the pond and recited a line of poetry that says, “The once splendid palace is gone, and only geese and ducks fly in.” That''s why the place is called Anapji, using the letters ''an'' for wild geese and ''ab'' for ducks. In the 1980s, pottery fragments with the inscription "Wolji" were excavated, and it was confirmed that this area was originally called "Wolji," which means "a pond that reflects the moon." And the name Anapji was changed to Wolji Pond afterwards.◎ Travel information to meet Hallyu’s charm - "The Beauty Inside"Se-gye visits this place to refresh her mind after she argues with Do-jae over the contract. Being one of the most famous tourist sites in Gyeongju, the scenery here is enough to help you forget the argument that you’ve just had, especially at night.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 444 AND city = 'gyeongju' AND name_l10n->>'en' = 'Bunhwangsa Temple';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 444 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Bunhwangsa Temple, located next to the ruins of Hwangnyongsa Temple in Gyeongju, was established in 634 during the Silla dynasty. Visitors can see cultural assets such as the Stone Brick Pagoda designated as a national treasure, and the Pedestal for the Stele of State Preceptor Hwajaeng registered as a Historic Site. Despite being a significant and ancient temple, much of it was lost during wars such as the Mongolia invasions and the Japanese invasions of Korea, leaving only a few buildings and temple grounds like Bogwangjeon Hall. Nearby, there is the Hwangnyongsa Museum.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 454 AND city = 'gyeongju' AND name_l10n->>'en' = 'Woljeonggyo Bridge';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 454 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Woljeonggyo Bridge, located in Gyo-dong, Gyeongju, was built during the Unified Silla period (AD 676-935), but was burnt down during the Joseon dynasty. Through historical research, the bridge was rebuilt in April 2018 to become the largest wooden bridge in Korea. According to Samguk Sagi (History of the Three Kingdoms), the bridge was built during the 19th year of King Gyeongdeok’s reign (AD 760), connecting Wolseong and Namsan together. The historical research to rebuild the bridge lasted from November 26, 1984 to September 8, 1986, finding that the bridge was made with wood for the first time. The first rebuilding of the bridge was from 2008 to 2013 and the finishing touches were added from April 2016 to April 2018. Through this research and rebuilding process, future restoration of historical buildings have a better reference to use.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 457 AND city = 'gyeongju' AND name_l10n->>'en' = 'Cheomseongdae Observatory';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 457 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Cheomseongdae Observatory, constructed during the reign of Queen Seondeok (r. 632-647), is one of the landmarks of Gyeongju. The observatory was built in a cylinder shape at approximately 9 meters in height. The observatory consists of 365 stones, symbolizing the number of days in a year. The rocks are piled in 27 layers symbolizing the 27th ruler, Queen Seondeok, and the days in a lunar month by adding the of two rock layers on top.◎ Travel information to meet Hallyu’s charm - "A Good Day to Be a Dog"Cheomseongdae Observatory, where Bo-gyeom and Ji-ah, bound by a special fate, encounter each other, is the landmark that represents the city of Gyeongju and one of the oldest astronomical observatories in the world. In addition to its superlative value as a historical site, it is also popular as a tourist destination thanks to flowers and plants that bloom each season.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 462 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Hwangnidan Street';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 462 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Hwangnidan Street was originally known as “Hwangnam Keungil” near Poseok-ro, Hwangnam-dong. Its name comes from the combination of Hwangnam-dong and Gyeongnidan Street in Itaewon, Seoul, meaning the “Gyeongnidan Street of Hwangnam-dong.” The street is home to numerous restaurants, cafes, photo studios, and shops housed in traditional hanok buildings, making it popular among the younger generations in Korea. The street also demonstrates newtro aesthetics due to the remaining old and worn buildings built during the 1960s and the ''70s. Hwangnidan Street is near Cheomseongdae Observatory, Daereungwon Ancient Tombs, and other major tourist sites, allowing the street to become a popular Gyeongju attraction as well.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 468 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Najeong Well';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 468 AND city = 'gyeongju' AND desc_l10n->>'en' = 'To the southeast of the royal tomb, is a small monument that has been erected among the pine trees; next to the monument is a well called Najeong. According to Samguksagi (Historical records of the Three Kingdoms) and Samgungnyusa (Memorabilia from the three dynasties), Park Hyeokgeose, the founding monarch of Silla, was born by this well. In 69 BC, Sobeolgong, the head of Goheochon Village, saw a white horse on its knees by the well. When he approached the well he found that the horse had magically disappeared and that a large egg was left in its place, from which a boy was born. When the boy turned 13 years old (57 BC), he was appointed king by the village chiefs and began to rule the area then called ‘Seorabeol’. A memorial stone (2.25 meters high, 45 centimeters long, and 21 centimeters wide) was erected in 1803 in the third year of King Sunjo''s rule (Joseon dynasty) detailing the historical origins of the founding father of Silla.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 473 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Bae-dong Samneung Royal Tombs';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 473 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Samneung meaning "three royal tombs," has strong ties to history. The three royal tombs house three kings of the Silla Kingdom: King Adala (8th King of the dynasty), King Sindeok (53rd) and King Gyeongmyeong (54th).   King Adala, who cared deeply for his people, went to war after his citizens were abducted by the invaders of Baekje. But when Baekje asked for a peace treaty, King Adala released the prisoners he took during the engagement. During his rulling, a  kingdom in Japan sent an envoy to ask for friendly relations with Silla. King Adala’s tomb is 58m in circumference at the base, 5.4m in height and 18m in diameter.   When King Hyogong died without any heirs, the people of the kingdom crowned his son-in-law as their next king – King Sindeok. During his reign, King Sindeok devoted himself to protecting his kingdom from invasions by Gyeonhwon and Gungye. The royal tomb is 61m in circumference at the base, 5.8m in height and 18m in diameter. It was robbed twice, inviting investigations in 1953 and 1963. The investigations revealed the tomb to be a chamber made of stone. King Gyeongmyeong, the son of King Sindeok, together with Wanggeon, the founder of the Goryeo dynasty, successfully defeated Gyeonhwon’s attack against Daeyaseong Fortress. During his reign, he attempted to establish diplomatic relations with the Hudang dynasty of China, but was unsuccessful. The tomb is 50m in circumference at the base, 4.5m in height and 16m in diameter.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 475 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Five Royal Tombs';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 475 AND city = 'gyeongju' AND desc_l10n->>'en' = 'The Five Royal Tombs (called Oreung in Korean) have been officially designated Historic Site No. 172 and are the final resting places of four kings of the Park clan—King Park Hyeokgeose (founder of the Silla Kingdom), King Namhae, King Yuri, and King Jabi—and one queen (Queen Aryeong, wife of King Park Hyeokgeose). 

To the east of the royal tombs lies Sungdeokjeon Shrine, which holds the ancestral tablet of King Park Hyeokgeose. Behind the shrine is the Aryeongjeong Well, said to be the birthplace of Queen Aryeong.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 481 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Poseokjeong Pavilion Site';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 481 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Poseokjeong Pavilion served as a separate palace where kings enjoyed banquets with nobles. The building no longer exists, but the abalone-shaped stone water canal still remains, speculated to have been built during the Unified Silla period although the exact year is unknown. The water canal has an estimated length of 10 meters, with a width of approximately 35 centimeters and an average depth of 26 centimeters. Based on Chinese writings from 353, it is said that drinking glasses were floated on the canal. One popular party game had guests creating poems before the glass had passed nine sections of the canel. Guests who could not do this had to drink three glasses. Modern research has shown that the site was not merely a place for fun, but also served as a meeting venue for the royal family, as well as for holding memorial services.';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Seokguram Grotto [UNESCO World Heritage]';

UPDATE city_spots SET name_l10n = name_l10n - 'ja', updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND name_l10n->>'ja' = '石窟庵と仏国寺';

UPDATE city_spots SET name_l10n = name_l10n - 'zh', updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND name_l10n->>'zh' = '石窟庵和佛国寺';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Seokguram Grotto was constructed by Kim Dae-Seong during the reign of King Gyeongdeok (742-765) of the Silla Kingdom. Located 3 kilometers away by hiking trail and 9 kilometers by car from Bulguksa Temple, the grotto was designed very harmoniously with the seated Buddha facing the East Sea. It is a valuable cultural heritage that is preserved and registered as a UNESCO World Heritage on December 6, 1995.';

UPDATE city_spots SET desc_l10n = desc_l10n - 'zh', updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND desc_l10n->>'zh' = '石窟庵建于公元8世纪，位于吐含山的斜坡上，石窟庵内有一尊纪念佛像，该佛像以普密斯帕莎穆德拉姿势面朝着大海。佛像周围有各种神仙、菩萨及弟子的雕像，雕刻细腻写实，是远东地区佛教艺术的杰作。';

UPDATE city_spots SET name_l10n = name_l10n - 'en', updated_at = now()
 WHERE id = 665 AND city = 'gyeongju' AND name_l10n->>'en' = 'Gyeongju Bae-dong Samneung Royal Tombs';

UPDATE city_spots SET desc_l10n = desc_l10n - 'en', updated_at = now()
 WHERE id = 665 AND city = 'gyeongju' AND desc_l10n->>'en' = 'Samneung meaning "three royal tombs," has strong ties to history. The three royal tombs house three kings of the Silla Kingdom: King Adala (8th King of the dynasty), King Sindeok (53rd) and King Gyeongmyeong (54th).   King Adala, who cared deeply for his people, went to war after his citizens were abducted by the invaders of Baekje. But when Baekje asked for a peace treaty, King Adala released the prisoners he took during the engagement. During his rulling, a  kingdom in Japan sent an envoy to ask for friendly relations with Silla. King Adala’s tomb is 58m in circumference at the base, 5.4m in height and 18m in diameter.   When King Hyogong died without any heirs, the people of the kingdom crowned his son-in-law as their next king – King Sindeok. During his reign, King Sindeok devoted himself to protecting his kingdom from invasions by Gyeonhwon and Gungye. The royal tomb is 61m in circumference at the base, 5.8m in height and 18m in diameter. It was robbed twice, inviting investigations in 1953 and 1963. The investigations revealed the tomb to be a chamber made of stone. King Gyeongmyeong, the son of King Sindeok, together with Wanggeon, the founder of the Goryeo dynasty, successfully defeated Gyeonhwon’s attack against Daeyaseong Fortress. During his reign, he attempted to establish diplomatic relations with the Hudang dynasty of China, but was unsuccessful. The tomb is 50m in circumference at the base, 4.5m in height and 16m in diameter.';

COMMIT;
