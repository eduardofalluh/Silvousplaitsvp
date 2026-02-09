# Configuration du Template EmailJS - En Français

## Configuration à faire dans EmailJS Dashboard

### 1. Onglet "Content" (Contenu)

#### Subject (Sujet) :
```
Nouveau message de contact - {{subject}}
```

#### Content (Contenu) :
```
Un nouveau message a été reçu depuis le formulaire de contact du site Silvousplait.

Nom: {{from_name}}
Courriel: {{from_email}}
Sujet: {{subject}}

Message:
{{message}}

---
Cet email a été envoyé depuis le formulaire de contact du site web.
```

### 2. Onglet "Settings" (Paramètres)

#### To Email (Email destinataire) :
```
eduardofalluh@gmail.com
```
*(Pour les tests - changez-le plus tard pour spectacles@silvousplaitsvp.com)*

#### From Name (Nom de l'expéditeur) :
```
{{from_name}}
```

#### From Email (Email de l'expéditeur) :
✅ **Cochez "Use Default Email Address"** (Utiliser l'adresse email par défaut)
*(Laissez le champ vide)*

#### Reply To (Répondre à) :
```
{{from_email}}
```
*(Important: Cela permet de répondre directement à la personne qui a envoyé le message)*

#### Bcc et Cc :
Laissez vides

### 3. Variables utilisées dans le template

Le formulaire envoie ces variables :
- `{{from_name}}` - Le nom de la personne
- `{{from_email}}` - L'email de la personne
- `{{subject}}` - Le sujet du message
- `{{message}}` - Le contenu du message

### 4. Après avoir sauvegardé

1. Cliquez sur "Save" (Sauvegarder)
2. Notez votre **Template ID** (visible dans l'URL ou dans les paramètres)
3. Notez votre **Service ID** (dans Email Services)
4. Notez votre **Public Key** (dans Account → General)
5. Mettez à jour ces 3 valeurs dans `contact.html`

