## Sub-Agent Routing Rules
Parallel dispatch (wszystkie warunki muszą być spełnione):
- 3+ niezależne zadania badawcze bez wspólnego stanu
- Każde zadanie ma jasno określony output (plik .md)
- Zadania nie modyfikują tych samych plików

Sequential dispatch (którykolwiek warunek wystarcza):
- Zadanie B potrzebuje outputu z zadania A
- Niejasny zakres — najpierw zrozum, potem deleguj

Background dispatch:
- Research i analiza (nie modyfikacje plików)
- Wyniki nie blokują dalszej pracy