/**
 * All the words the stream says — facts, quiz questions, planet info cards and
 * chat prompts — in one place so you can edit them without touching any
 * drawing code. Works in Node (require) and the browser (window.SolarShowContent).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SolarShowContent = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Shown in the bottom ticker, one every FACT_INTERVAL seconds.
  const FACTS = [
    'Mercury has no atmosphere and swings between extreme heat and cold.',
    'Venus takes longer to spin once than to orbit the Sun.',
    'Earth is the only planet not named after a mythological god.',
    "Mars' Olympus Mons is the tallest volcano in the solar system.",
    'The asteroid belt holds millions of rocky bodies, yet together they weigh less than our Moon.',
    'Jupiter has more than 90 known moons.',
    "Saturn's rings are mostly water ice, from dust grains to house-sized chunks.",
    'A year on Uranus lasts about 84 Earth years.',
    'Neptune has winds that can exceed 2,000 km/h.',
    'The Sun makes up over 99.8% of the mass in our solar system.',
    'Sunlight takes about 8 minutes and 20 seconds to reach Earth.',
    "Jupiter's Great Red Spot is a storm wider than Earth, watched for over 150 years.",
    'A day on Mars is about 40 minutes longer than a day on Earth.',
    'Saturn is less dense than water. It would float in a big enough bathtub.',
    'Neptune was found with maths before anyone saw it, in 1846.',
    'A comet\'s tail always points away from the Sun, whichever way the comet is moving.',
    'Uranus spins on its side, tilted about 98 degrees.',
    'Venus is hotter than Mercury thanks to its thick carbon dioxide atmosphere.',
    'The Moon drifts about 3.8 cm farther from Earth every year.',
  ];

  // Quiz rounds. `answer` is the index (0-3) of the correct option.
  // Keep questions under ~90 characters and options under ~24 so they fit the panel.
  const QUIZ = [
    { q: 'Which planet has the most known moons?',
      options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], answer: 1,
      why: 'Saturn has more than 250 confirmed moons, and the count keeps growing.' },
    { q: 'Which planet is the hottest?',
      options: ['Mercury', 'Mars', 'Venus', 'Earth'], answer: 2,
      why: 'Venus traps heat under a thick carbon dioxide blanket, about 465 °C.' },
    { q: 'Which planet spins tipped on its side?',
      options: ['Uranus', 'Neptune', 'Saturn', 'Jupiter'], answer: 0,
      why: 'Uranus is tilted about 98 degrees, so it rolls around the Sun.' },
    { q: "Jupiter's Great Red Spot is a giant...",
      options: ['Volcano', 'Ocean', 'Storm', 'Crater'], answer: 2,
      why: 'It is a storm wider than Earth, and it has raged for over 150 years.' },
    { q: 'How long does sunlight take to reach Earth?',
      options: ['8 seconds', '8 minutes', '8 hours', '8 days'], answer: 1,
      why: 'About 8 minutes and 20 seconds, travelling at 300,000 km every second.' },
    { q: 'Which planet has the tallest volcano?',
      options: ['Venus', 'Earth', 'Mercury', 'Mars'], answer: 3,
      why: 'Olympus Mons on Mars is about 22 km high, nearly 2.5 times Everest.' },
    { q: 'How many Earths would fit inside Jupiter?',
      options: ['About 13', 'About 130', 'About 1,300', 'About 13,000'], answer: 2,
      why: 'By volume, roughly 1,300 Earths could fit inside Jupiter.' },
    { q: 'Which planet has the fastest winds?',
      options: ['Mars', 'Venus', 'Earth', 'Neptune'], answer: 3,
      why: 'Neptune\'s winds pass 2,000 km/h, faster than the speed of sound.' },
    { q: 'Which planet is less dense than water?',
      options: ['Jupiter', 'Saturn', 'Neptune', 'Earth'], answer: 1,
      why: 'Saturn is mostly hydrogen and helium, so it is lighter than water.' },
    { q: 'What lies between Mars and Jupiter?',
      options: ['Kuiper belt', 'Oort cloud', 'Asteroid belt', 'Van Allen belt'], answer: 2,
      why: 'The main asteroid belt holds millions of rocky bodies.' },
    { q: 'Which takes longer: one spin, or one trip around the Sun?',
      options: ['Mercury spin', 'Venus spin', 'Earth spin', 'Mars spin'], answer: 1,
      why: 'Venus turns once in 243 Earth days but orbits the Sun in 225.' },
    { q: 'What is the Sun mostly made of?',
      options: ['Hydrogen and helium', 'Molten iron', 'Oxygen and carbon', 'Liquid water'], answer: 0,
      why: 'About 98% hydrogen and helium, fused together in the core.' },
    { q: 'Which planet is not named after a god?',
      options: ['Mars', 'Earth', 'Saturn', 'Venus'], answer: 1,
      why: 'Earth\'s name comes from old Germanic and English words for ground.' },
    { q: "What are Saturn's rings mostly made of?",
      options: ['Molten rock', 'Metal dust', 'Frozen methane', 'Chunks of water ice'], answer: 3,
      why: 'Billions of ice pieces, from tiny grains to house-sized boulders.' },
    { q: 'Which planet takes about 165 years to orbit the Sun?',
      options: ['Neptune', 'Uranus', 'Saturn', 'Jupiter'], answer: 0,
      why: 'Neptune finished its first orbit since discovery in 2011.' },
    { q: 'A comet\'s tail points...',
      options: ['Behind its path', 'Toward the Sun', 'Away from the Sun', 'Straight up'], answer: 2,
      why: 'Sunlight and the solar wind push the tail away from the Sun.' },
    { q: 'Which planet is home to the moon Titan?',
      options: ['Jupiter', 'Mars', 'Neptune', 'Saturn'], answer: 3,
      why: 'Titan has a thick atmosphere and lakes of liquid methane.' },
    { q: 'Which moon of Jupiter likely hides an ocean?',
      options: ['Phobos', 'Europa', 'Triton', 'Charon'], answer: 1,
      why: 'Europa has a salty ocean under its ice, a target for life searches.' },
    { q: 'Who spotted Uranus in 1781?',
      options: ['Galileo', 'Newton', 'William Herschel', 'Edwin Hubble'], answer: 2,
      why: 'Herschel first thought it was a comet, then realised it was a planet.' },
    { q: 'Which planet is closest to the Sun?',
      options: ['Venus', 'Mercury', 'Earth', 'Mars'], answer: 1,
      why: 'Mercury is closest, and it circles the Sun in just 88 Earth days.' },
  ];

  // Info cards for the planet spotlight. `rows` are [label, value].
  const BODY_INFO = {
    Sun: {
      kind: 'Our star', blurb: 'Fusing about 600 million tonnes of hydrogen every second.',
      rows: [['Width', '1.39 million km'], ['Surface', '5,500 °C'], ['Core', '15 million °C'],
             ['Age', '4.6 billion years'], ['Share of mass', '99.86%'], ['Planets', '8']],
    },
    Mercury: {
      kind: 'Rocky planet', blurb: 'The smallest planet, and a world of craters and cliffs.',
      rows: [['Width', '4,879 km'], ['From the Sun', '58 million km'], ['One spin', '59 Earth days'],
             ['One year', '88 Earth days'], ['Moons', '0'], ['Average', '167 °C']],
    },
    Venus: {
      kind: 'Rocky planet', blurb: 'Wrapped in acid clouds, and it spins backwards.',
      rows: [['Width', '12,104 km'], ['From the Sun', '108 million km'], ['One spin', '243 Earth days'],
             ['One year', '225 Earth days'], ['Moons', '0'], ['Surface', '465 °C']],
    },
    Earth: {
      kind: 'Rocky planet', blurb: 'The only world we know that hosts life.',
      rows: [['Width', '12,742 km'], ['From the Sun', '150 million km'], ['One spin', '24 hours'],
             ['One year', '365.25 days'], ['Moons', '1'], ['Average', '15 °C']],
    },
    Mars: {
      kind: 'Rocky planet', blurb: 'Home to the biggest volcano and the longest canyon around.',
      rows: [['Width', '6,779 km'], ['From the Sun', '228 million km'], ['One spin', '24 h 37 m'],
             ['One year', '687 Earth days'], ['Moons', '2'], ['Average', '-65 °C']],
    },
    Jupiter: {
      kind: 'Gas giant', blurb: 'More massive than all the other planets put together.',
      rows: [['Width', '139,820 km'], ['From the Sun', '778 million km'], ['One spin', '9 h 56 m'],
             ['One year', '11.9 Earth years'], ['Moons', '90+'], ['Cloud tops', '-110 °C']],
    },
    Saturn: {
      kind: 'Gas giant', blurb: 'Its rings stretch 280,000 km but are mostly thinner than a stadium.',
      rows: [['Width', '116,460 km'], ['From the Sun', '1.43 billion km'], ['One spin', '10 h 33 m'],
             ['One year', '29.4 Earth years'], ['Moons', '250+'], ['Cloud tops', '-140 °C']],
    },
    Uranus: {
      kind: 'Ice giant', blurb: 'A pale, sideways world with faint dark rings.',
      rows: [['Width', '50,724 km'], ['From the Sun', '2.87 billion km'], ['One spin', '17 h 14 m'],
             ['One year', '84 Earth years'], ['Moons', '28+'], ['Cloud tops', '-195 °C']],
    },
    Neptune: {
      kind: 'Ice giant', blurb: 'The windiest planet, and the farthest from the Sun.',
      rows: [['Width', '49,244 km'], ['From the Sun', '4.5 billion km'], ['One spin', '16 h 6 m'],
             ['One year', '164.8 Earth years'], ['Moons', '16+'], ['Cloud tops', '-201 °C']],
    },
  };

  // Ticker prompts. Everyone can act on the generic ones. The chat ones only
  // appear when the chat connection is active (see README), so viewers are
  // never told to type a command that does nothing.
  const PROMPTS_GENERIC = [
    'Which planet would you live on? Tell us in the chat.',
    'Say hello in the chat and tell us where you are watching from.',
    'A new quiz question appears every 5 minutes. Answer in the chat.',
    'Enjoying the view? Like the stream and subscribe for more.',
    'Know a space fan? Share this stream with them.',
  ];
  const PROMPTS_CHAT = [
    'Type !comet in the chat to launch a comet.',
    'Type !planet mars (or any planet) to fly the camera there.',
    'Type !warp to speed up time for everyone.',
    'Type !fact to pull up a random space fact.',
    'Type !help to see every command.',
  ];

  return { FACTS, QUIZ, BODY_INFO, PROMPTS_GENERIC, PROMPTS_CHAT };
}));
