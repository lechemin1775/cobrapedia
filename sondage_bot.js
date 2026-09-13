const fs = require('fs');

// ==========================================
// 0. OUTIL DE MÉLANGE (Algorithme Fisher-Yates)
// ==========================================
function melangerTableau(tableau) {
    let tab = [...tableau]; 
    for (let i = tab.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tab[i], tab[j]] = [tab[j], tab[i]];
    }
    return tab;
}

// ==========================================
// 1. CONFIGURATION DU BOT ET DES CIBLES
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; 

// On définit ici tous les groupes et sujets où le bot doit publier
const CIBLES = [
    { 
        nom: "Ancien Groupe",
        chat_id: "-1001707713364", 
        thread_id: "13963" 
    },
    { 
        nom: "Nouveau Global Hub",
        chat_id: "-1004411153937", // L'ID extrait de ton lien avec -100 devant
        thread_id: "6"            // Le numéro du sujet extrait de ton lien
    }
];

async function executerRituelQuotidien() {
    try {
        // ==========================================
        // 1. CHARGEMENT DES BASES
        // ==========================================
        const quiz_db_raw = JSON.parse(fs.readFileSync('quete_ascension.json', 'utf8'));
        let cobrapedia_db_raw = [];
        if (fs.existsSync('cobrapedia.json')) {
            cobrapedia_db_raw = JSON.parse(fs.readFileSync('cobrapedia.json', 'utf8'));
        }
        const citations_db_raw = JSON.parse(fs.readFileSync('citations_cobrapedia.json', 'utf8'));

        // ==========================================
        // 2. PRÉPARATION DES QUESTIONS
        // ==========================================
        let quiz_db = quiz_db_raw.map(q => ({
            texte: q.texte, 
            propositions: q.propositions, 
            reponse: q.reponse, 
            explication: q.explication || q.indice || ""
        }));

        let cobra_terms = cobrapedia_db_raw.map(c => c.fr ? c.fr.terme : c.terme);
        let cobrapedia_db = cobrapedia_db_raw.map(c => {
            let terme = c.fr ? c.fr.terme : c.terme;
            let definition = c.fr ? c.fr.definition : c.definition;
            definition = definition.replace(/\[\d+\]/g, '').replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '').trim();

            let distractors = cobra_terms.filter(t => t !== terme);
            let props = [terme];
            for(let i=0; i<3; i++) {
                if (distractors.length > 0) {
                    let rIdx = Math.floor(Math.random() * distractors.length);
                    props.push(distractors.splice(rIdx, 1)[0]);
                }
            }
            
            let extrait = definition.length > 240 ? definition.substring(0, 240) + "..." : definition;
            return {
                texte: `Quel concept correspond à cette transmission ?\n\n"${extrait}"`,
                propositions: props, 
                reponse: terme, 
                explication: definition
            };
        });

        const full_db = [...quiz_db, ...cobrapedia_db];

        // ==========================================
        // 3. SÉLECTION ET GESTION DES FORMATS VRAI/FAUX
        // ==========================================
        const joursEcoules = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
        
        // Sélection de la question du jour
        const indexDuJour = joursEcoules % full_db.length;
        let questionChoisie = Object.assign({}, full_db[indexDuJour]); 

        // 🕸️ DÉTECTION D'INTERFÉRENCE DÉTERMINISTE (Synchronisée Matin/Soir)
        const chanceInterference = (joursEcoules * 13) % 100; 
        const isInterference = (chanceInterference < 25);     
        
        let reponseOriginale = questionChoisie.reponse || "";
        let texteQuestionTelegram = "";

        if (isInterference) {
            let vraieReponseNorm = reponseOriginale.trim().toLowerCase();
            
            let estVrai = ((joursEcoules * 17) % 2 === 0); 
            let texteAffirme = "";

            if (estVrai) {
                texteAffirme = reponseOriginale;
            } else {
                let faussesPropositions = questionChoisie.propositions.filter(p => 
                    p.trim().toLowerCase() !== vraieReponseNorm
                );
                let indexFausse = (joursEcoules * 7) % faussesPropositions.length;
                texteAffirme = faussesPropositions[indexFausse] || "Illusion de la Matrice.";
            }

            texteQuestionTelegram = `✨ **ÉPREUVE DU JOUR** ✨\n\n*L'affirmation suivante est-elle VRAIE ou FAUSSE ?*\n\n${questionChoisie.texte}\n\n« ${texteAffirme} »`;
            questionChoisie.propositions = ["VRAI", "FAUX"];
            questionChoisie.reponse = estVrai ? "VRAI" : "FAUX";
            questionChoisie.estVrai = estVrai;
        } else {
            texteQuestionTelegram = `✨ **ÉPREUVE DU JOUR** ✨\n\n${questionChoisie.texte}`;
        }
        
        // Mélange des réponses
        const propositionsFinales = isInterference ? questionChoisie.propositions : melangerTableau(questionChoisie.propositions);
        
        const optionsSafe = propositionsFinales.map(prop => 
            prop.length > 100 ? prop.substring(0, 97) + "..." : prop
        );

        // Sélection de la citation du jour
        const indexCitation = joursEcoules % citations_db_raw.length;
        const citationChoisie = citations_db_raw[indexCitation];

        // Signatures communes
        const urlSite = "https://leportaildelumiere.com";
        const urlApp = "https://play.google.com/store/apps/details?id=com.leportaildelumiere.encyclopedie"; 
        const footerHTML = `\n\n🌐 <a href="${urlSite}">Le Portail de Lumière</a>\n📱 <a href="${urlApp}">Application Cobrapédia pour Android</a>`;

        // ==========================================
        // 4. DÉTERMINATION DU MOMENT ET ENVOI AUX CIBLES
        // ==========================================
        const heureUTC = new Date().getUTCHours(); 
        
        // On boucle sur nos deux groupes pour envoyer le message correspondant à l'heure
        for (const cible of CIBLES) {
            
            // --- MARCHE 1 : MATIN ---
            if (heureUTC >= 4 && heureUTC < 8) {
                const paramsPoll = {
                    chat_id: cible.chat_id,
                    message_thread_id: cible.thread_id, 
                    question: texteQuestionTelegram.substring(0, 300),
                    options: JSON.stringify(optionsSafe),
                    type: 'regular', 
                    is_anonymous: true
                };

                const reponseTelegram = await envoyerAITelegram('sendPoll', paramsPoll);
                if (reponseTelegram.ok) {
                    console.log(`✨ Succès : Épreuve du matin publiée sur [${cible.nom}] !`);
                } else {
                    console.error(`🕸️ Erreur Telegram Matin sur [${cible.nom}] :`, reponseTelegram.description);
                }

            // --- MARCHE 2 : MIDI ---
            } else if (heureUTC >= 8 && heureUTC < 14) {
                const messageCitation = `⚡ <b>— LA PENSÉE DU JOUR —</b>\n\n` +
                                        `<i>"${citationChoisie.texte_fr}"</i>\n\n` +
                                        `\u2003\u2003<b>✍️ — Cobrapédia —</b>` +
                                        footerHTML;

                const paramsCitation = {
                    chat_id: cible.chat_id,
                    message_thread_id: cible.thread_id, 
                    text: messageCitation,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true 
                };

                const reponseTelegram = await envoyerAITelegram('sendMessage', paramsCitation);
                if (reponseTelegram.ok) {
                    console.log(`📜 Succès : Pensée du jour publiée sur [${cible.nom}] !`);
                } else {
                    console.error(`🕸️ Erreur Telegram Citation sur [${cible.nom}] :`, reponseTelegram.description);
                }

            // --- MARCHE 3 : SOIR ---
            } else {
                let blocVerite = "";
                if (isInterference && questionChoisie.estVrai === false) {
                    blocVerite = `\n\n🛡️ <b>VÉRITÉ COSMIQUE :</b>\n<i>"${reponseOriginale}"</i>`;
                }

                const messageResolution = `✨ <b>RÉSOLUTION DE L'ÉPREUVE DU JOUR</b>\n\n` +
                                          `La bonne réponse était : <b>${questionChoisie.reponse}</b>` + 
                                          blocVerite + `\n\n` +
                                          `📚 <b>Transmission Akashique :</b>\n<i>${questionChoisie.explication}</i>` + 
                                          footerHTML;

                const paramsResolution = {
                    chat_id: cible.chat_id,
                    message_thread_id: cible.thread_id, 
                    text: messageResolution,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true 
                };

                const reponseTelegram = await envoyerAITelegram('sendMessage', paramsResolution);
                if (reponseTelegram.ok) {
                    console.log(`🌌 Succès : Résolution du soir publiée sur [${cible.nom}] !`);
                } else {
                    console.error(`🕸️ Erreur Telegram Soir sur [${cible.nom}] :`, reponseTelegram.description);
                }
            }
        } // Fin de la boucle CIBLES

    } catch (error) {
        console.error("Interférence majeure :", error);
    }
}

// ==========================================
// 5. MOTEUR DE COMMUNICATION TELEGRAM
// ==========================================
async function envoyerAITelegram(methode, corps) {
    // Remplacement par fetch natif standard
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${methode}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
    });
    return await response.json();
}

// Lancement du script
executerRituelQuotidien();
